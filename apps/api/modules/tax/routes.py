"""Income Tax HTTP routes — factory avoids circular imports with main.get_current_user."""

from __future__ import annotations

import json
from typing import Any, Callable, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

import database
import models
import storage_service
from modules.tax import service, tax_engine
from modules.tax.schemas import (
    DependantCreate, DependantUpdate, EAReview, EmployerCreate, EmployerUpdate,
    IncomeCreate, IncomeUpdate, RebateCreate, RebateUpdate, ReliefCreate, ReliefItemCreate,
    ReliefUpdate, TaxDocumentMeta, TaxProfileUpdate, TransactionLinkCreate, TransactionLinkUpdate,
)

from uuid import uuid4


def _make_safe_stem(filename: str) -> str:
    safe = "".join(ch if ch.isalnum() else "_" for ch in (filename or "doc")[:60]) or "doc"
    return safe


def create_tax_router(*, get_current_user: Callable[..., Any], publish_realtime: Callable[..., None]) -> APIRouter:
    router = APIRouter(prefix="/tax", tags=["tax"])

    def _publish(user_id: str):
        try:
            publish_realtime(user_id, "changed", "tax")
        except Exception:
            pass

    # ── assessment years ────────────────────────────────────────────────────
    @router.get("/years")
    async def list_years(
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        # Years that have any tax data for this user
        profile_res = await db.execute(
            select(models.TaxProfile.assessment_year).where(
                models.TaxProfile.user_id == current_user.id
            )
        )
        ea_res = await db.execute(
            select(models.TaxEAForm.assessment_year).where(
                models.TaxEAForm.user_id == current_user.id
            )
        )
        years = set(r[0] for r in profile_res.all())
        years.update(r[0] for r in ea_res.all())
        # Always include current year so user can start
        if not years:
            years.add(2026)
        return {"years": sorted(years, reverse=True)}

    # ── dashboard ───────────────────────────────────────────────────────────
    @router.get("/dashboard")
    async def dashboard(
        assessment_year: int = Query(default=0),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        if assessment_year == 0:
            assessment_year = 2026
        await service.get_profile_or_create(db, current_user.id, assessment_year)
        calc = await tax_engine.calculate(db, current_user.id, assessment_year)
        return calc

    # ── profile ─────────────────────────────────────────────────────────────
    @router.get("/profile")
    async def get_profile(
        assessment_year: int = Query(default=0),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        if assessment_year == 0:
            assessment_year = 2026
        profile = await service.get_profile_or_create(db, current_user.id, assessment_year)
        await db.commit()
        return service.serialize_profile(profile)

    @router.patch("/profile")
    async def update_profile(
        assessment_year: int = Query(default=0),
        payload: TaxProfileUpdate = None,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        if assessment_year == 0:
            assessment_year = 2026
        if payload is None:
            payload = TaxProfileUpdate()
        profile = await service.get_profile_or_create(db, current_user.id, assessment_year)
        changes = payload.model_dump(exclude_unset=True)
        if "tax_identifier" in changes:
            tin = (changes.pop("tax_identifier") or "").strip()
            profile.tax_identifier_encrypted = _encrypt_tin(tin) if tin else None
        for k, v in changes.items():
            setattr(profile, k, v)
        await db.commit()
        _publish(current_user.id)
        return service.serialize_profile(profile)

    def _encrypt_tin(tin: str) -> str:
        # At-rest obfuscation for sensitive TIN. Local-grade (not production KMS).
        import base64 as _b64, os
        iv = os.urandom(8)
        data = iv + tin.encode("utf-8")
        return "v1:" + _b64.urlsafe_b64encode(data).decode()

    # ── employers ───────────────────────────────────────────────────────────
    @router.get("/employers")
    async def list_employers(
        assessment_year: int = Query(default=0),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        if assessment_year == 0:
            assessment_year = 2026
        res = await db.execute(
            select(models.TaxEmployer).where(
                models.TaxEmployer.user_id == current_user.id,
                models.TaxEmployer.assessment_year == assessment_year,
            )
        )
        return [service.serialize_employer(e) for e in res.scalars().all()]

    @router.post("/employers")
    async def create_employer(
        payload: EmployerCreate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = models.TaxEmployer(user_id=current_user.id, **payload.model_dump())
        db.add(row)
        await db.commit()
        await db.refresh(row)
        _publish(current_user.id)
        return service.serialize_employer(row)

    @router.patch("/employers/{employer_id}")
    async def update_employer(
        employer_id: int,
        payload: EmployerUpdate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await _get_employer_or_404(db, employer_id, current_user.id)
        for k, v in payload.model_dump(exclude_unset=True).items():
            setattr(row, k, v)
        await db.commit()
        _publish(current_user.id)
        return service.serialize_employer(row)

    async def _get_employer_or_404(db, employer_id, user_id):
        res = await db.execute(
            select(models.TaxEmployer).where(
                models.TaxEmployer.id == employer_id,
                models.TaxEmployer.user_id == user_id,
            )
        )
        row = res.scalars().first()
        if not row:
            raise HTTPException(status_code=404, detail="Employer tidak dijumpai.")
        return row

    # ── EA / EC forms ───────────────────────────────────────────────────────
    @router.get("/ea-forms")
    async def list_ea_forms(
        assessment_year: int = Query(default=0),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        if assessment_year == 0:
            assessment_year = 2026
        res = await db.execute(
            select(models.TaxEAForm).where(
                models.TaxEAForm.user_id == current_user.id,
                models.TaxEAForm.assessment_year == assessment_year,
            )
        )
        return [service.serialize_ea(f) for f in res.scalars().all()]

    @router.post("/ea-forms")
    async def create_ea_form(
        payload: EAReview,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        data = payload.model_dump()
        confirmed = {k: v for k, v in data.items() if k != "assessment_year"}
        row = models.TaxEAForm(user_id=current_user.id, **data)
        row.raw_extraction_json = json.dumps(confirmed)
        row.confirmed_json = json.dumps(confirmed)
        row.review_status = "confirmed"
        row.ocr_status = "manual"
        db.add(row)
        await db.commit()
        await db.refresh(row)
        await _auto_create_income_from_ea(db, row)
        _publish(current_user.id)
        return service.serialize_ea(row)

    @router.post("/ea-forms/upload")
    async def upload_ea(
        assessment_year: int = Form(...),
        file: UploadFile = File(...),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        payload = await file.read()
        try:
            mime_type, extension = storage_service.validate_receipt_file(file.filename, file.content_type, payload)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        # store document securely
        doc = models.TaxDocument(
            user_id=current_user.id,
            assessment_year=assessment_year,
            document_type="ea",
            original_filename=file.filename,
            mime_type=mime_type,
            ocr_status="pending",
        )
        object_key = f"tax/{current_user.id}/{assessment_year}/ea/{uuid4().hex}-{_make_safe_stem(file.filename)}{extension}"
        try:
            storage_service.upload_receipt_object(object_key, payload, mime_type, filename=file.filename)
        except Exception as exc:
            raise HTTPException(status_code=502, detail="Upload failed.") from exc
        doc.storage_reference = object_key
        db.add(doc)
        await db.commit()
        await db.refresh(doc)

        # run OCR extraction (draft, not confirmed)
        from modules.tax import ea_ocr
        try:
            draft = await ea_ocr.extract_ea(payload, mime_type)
        except Exception as exc:
            doc.ocr_status = "failed"
            await db.commit()
            raise HTTPException(status_code=422, detail=f"OCR gagal: {exc}") from exc

        row = models.TaxEAForm(
            user_id=current_user.id,
            assessment_year=draft.assessment_year or assessment_year,
            document_id=doc.id,
            document_type=draft.document_type,
            ocr_status="extracted",
            review_status="pending",
            confidence=draft.confidence,
            employer_name=draft.employer_name,
            employer_tax_number=draft.employer_tax_number,
            employee_name=draft.employee_name,
            employee_ic=draft.employee_ic,
            salary=draft.salary,
            bonus=draft.bonus,
            commission=draft.commission,
            allowances=draft.allowances,
            benefits=draft.benefits,
            perquisites=draft.perquisites,
            benefit_in_kind=draft.benefit_in_kind,
            living_accommodation=draft.living_accommodation,
            total_employment_income=draft.total_employment_income,
            pcb_amount=draft.pcb_amount,
            cp38_amount=draft.cp38_amount,
            epf_amount=draft.epf_amount,
            socso_amount=draft.socso_amount,
            zakat_amount=draft.zakat_amount,
            raw_extraction_json=draft.raw_json,
        )
        db.add(row)
        doc.ocr_status = "done"
        await db.commit()
        await db.refresh(row)
        _publish(current_user.id)
        return service.serialize_ea(row)

    @router.patch("/ea-forms/{ea_id}")
    async def review_ea(
        ea_id: int,
        payload: EAReview,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await _get_ea_or_404(db, ea_id, current_user.id)
        data = payload.model_dump(exclude_unset=True)
        for k, v in data.items():
            setattr(row, k, v)
        row.confirmed_json = json.dumps(payload.model_dump())
        row.review_status = "confirmed"
        await db.commit()
        await _auto_create_income_from_ea(db, row)
        _publish(current_user.id)
        return service.serialize_ea(row)

    @router.post("/ea-forms/{ea_id}/confirm")
    async def confirm_ea(
        ea_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await _get_ea_or_404(db, ea_id, current_user.id)
        if row.confirmed_json:
            row.confirmed_json = row.confirmed_json or row.raw_extraction_json
        row.review_status = "confirmed"
        await db.commit()
        await _auto_create_income_from_ea(db, row)
        _publish(current_user.id)
        return service.serialize_ea(row)

    async def _get_ea_or_404(db, ea_id, user_id):
        res = await db.execute(
            select(models.TaxEAForm).where(
                models.TaxEAForm.id == ea_id,
                models.TaxEAForm.user_id == user_id,
            )
        )
        row = res.scalars().first()
        if not row:
            raise HTTPException(status_code=404, detail="Borang EA tidak dijumpai.")
        return row

    async def _auto_create_income_from_ea(db, ea: models.TaxEAForm):
        """Create/refresh confirmed employment income from a confirmed EA form."""
        if ea.review_status != "confirmed":
            return
        total = ea.total_employment_income
        if total is None:
            parts = [ea.salary, ea.bonus, ea.commission, ea.allowances, ea.benefits,
                     ea.perquisites, ea.benefit_in_kind, ea.living_accommodation]
            total = sum((p or 0) for p in parts)
        # find existing income linked to this EA
        res = await db.execute(
            select(models.TaxIncome).where(
                models.TaxIncome.user_id == ea.user_id,
                models.TaxIncome.assessment_year == ea.assessment_year,
                models.TaxIncome.source_type == "ea",
                models.TaxIncome.source_id == ea.id,
            )
        )
        income = res.scalars().first()
        if income is None:
            income = models.TaxIncome(
                user_id=ea.user_id,
                assessment_year=ea.assessment_year,
                income_type="employment",
                source_type="ea",
                source_id=ea.id,
                employer_id=ea.employer_id,
                employer_name=ea.employer_name,
                gross_amount=total,
                taxable_amount=total,
                status="confirmed",
            )
            db.add(income)
        else:
            income.gross_amount = total
            income.taxable_amount = total
            income.employer_name = ea.employer_name
            income.status = "confirmed"
        await db.commit()

    # ── income ──────────────────────────────────────────────────────────────
    @router.get("/income")
    async def list_income(
        assessment_year: int = Query(default=0),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        if assessment_year == 0:
            assessment_year = 2026
        res = await db.execute(
            select(models.TaxIncome).where(
                models.TaxIncome.user_id == current_user.id,
                models.TaxIncome.assessment_year == assessment_year,
            )
        )
        return [service.serialize_income(i) for i in res.scalars().all()]

    @router.post("/income")
    async def create_income(
        payload: IncomeCreate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        data = payload.model_dump()
        profile = await service.get_profile_or_create(db, current_user.id, payload.assessment_year)
        row = models.TaxIncome(user_id=current_user.id, tax_profile_id=profile.id, **data)
        db.add(row)
        await db.commit()
        await db.refresh(row)
        _publish(current_user.id)
        return service.serialize_income(row)

    @router.patch("/income/{income_id}")
    async def update_income(
        income_id: int,
        payload: IncomeUpdate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await _get_income_or_404(db, income_id, current_user.id)
        for k, v in payload.model_dump(exclude_unset=True).items():
            setattr(row, k, v)
        await db.commit()
        _publish(current_user.id)
        return service.serialize_income(row)

    @router.delete("/income/{income_id}")
    async def delete_income(
        income_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await _get_income_or_404(db, income_id, current_user.id)
        await db.delete(row)
        await db.commit()
        _publish(current_user.id)
        return {"detail": "Pendapatan dipadam."}

    async def _get_income_or_404(db, income_id, user_id):
        res = await db.execute(
            select(models.TaxIncome).where(
                models.TaxIncome.id == income_id,
                models.TaxIncome.user_id == user_id,
            )
        )
        row = res.scalars().first()
        if not row:
            raise HTTPException(status_code=404, detail="Pendapatan tidak dijumpai.")
        return row

    # ── dependants ──────────────────────────────────────────────────────────
    @router.get("/dependants")
    async def list_dependants(
        assessment_year: int = Query(default=0),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        if assessment_year == 0:
            assessment_year = 2026
        profile = await service.get_profile_or_create(db, current_user.id, assessment_year)
        await db.commit()
        res = await db.execute(
            select(models.TaxDependant).where(models.TaxDependant.tax_profile_id == profile.id)
        )
        rows = []
        for d in res.scalars().all():
            rows.append({
                "id": d.id,
                "dependant_type": d.dependant_type,
                "relief_percentage": d.relief_percentage,
                "eligibility_status": d.eligibility_status,
            })
        return rows

    @router.post("/dependants")
    async def create_dependant(
        assessment_year: int = Query(default=0),
        payload: DependantCreate = None,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        if assessment_year == 0:
            assessment_year = 2026
        if payload is None:
            payload = DependantCreate(dependant_type="under18")
        profile = await service.get_profile_or_create(db, current_user.id, assessment_year)
        row = models.TaxDependant(tax_profile_id=profile.id, **payload.model_dump())
        db.add(row)
        await db.commit()
        await db.refresh(row)
        _publish(current_user.id)
        return {"id": row.id, "dependant_type": row.dependant_type, "relief_percentage": row.relief_percentage, "eligibility_status": row.eligibility_status}

    @router.patch("/dependants/{dep_id}")
    async def update_dependant(
        dep_id: int,
        payload: DependantUpdate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await _get_dependant_or_404(db, dep_id, current_user.id)
        for k, v in payload.model_dump(exclude_unset=True).items():
            setattr(row, k, v)
        await db.commit()
        _publish(current_user.id)
        return {"id": row.id, "dependant_type": row.dependant_type, "relief_percentage": row.relief_percentage, "eligibility_status": row.eligibility_status}

    @router.delete("/dependants/{dep_id}")
    async def delete_dependant(
        dep_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await _get_dependant_or_404(db, dep_id, current_user.id)
        await db.delete(row)
        await db.commit()
        _publish(current_user.id)
        return {"detail": "Tanggungan dipadam."}

    async def _get_dependant_or_404(db, dep_id, user_id):
        # join through profile
        res = await db.execute(
            select(models.TaxDependant, models.TaxProfile).join(
                models.TaxProfile, models.TaxDependant.tax_profile_id == models.TaxProfile.id
            ).where(
                models.TaxDependant.id == dep_id,
                models.TaxProfile.user_id == user_id,
            )
        )
        row = res.first()
        if not row:
            raise HTTPException(status_code=404, detail="Tanggungan tidak dijumpai.")
        return row[0]

    # ── reliefs ─────────────────────────────────────────────────────────────
    @router.get("/reliefs")
    async def list_reliefs(
        assessment_year: int = Query(default=0),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        if assessment_year == 0:
            assessment_year = 2026
        rules = await tax_engine.get_active_relief_rules(db, assessment_year)
        rule_map = {r.rule_code: r for r in rules}
        res = await db.execute(
            select(models.TaxRelief).where(
                models.TaxRelief.user_id == current_user.id,
                models.TaxRelief.assessment_year == assessment_year,
            )
        )
        claims = {c.relief_code: c for c in res.scalars().all()}
        result = []
        for r in rules:
            claim = claims.get(r.rule_code)
            limit = float(r.limit_amount) if r.limit_amount is not None else None
            group = "other"
            if r.eligibility_rule:
                try:
                    group = json.loads(r.eligibility_rule).get("group", "other")
                except Exception:
                    group = "other"
            if claim:
                item = service.serialize_relief(claim, limit=limit)
                item["group"] = group
                result.append(item)
            else:
                result.append({
                    "id": None, "assessment_year": assessment_year,
                    "relief_code": r.rule_code, "name": r.name,
                    "claimed_amount": 0, "eligible_amount": 0,
                    "max_limit": limit, "source": "manual", "status": "claimed",
                    "group": group, "doc_requirement": r.document_requirement,
                })
        return result

    @router.post("/reliefs")
    async def create_relief(
        payload: ReliefCreate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        rules = await tax_engine.get_active_relief_rules(db, payload.assessment_year)
        rule_map = {r.rule_code: r for r in rules}
        rule = rule_map.get(payload.relief_code)
        if rule is None:
            raise HTTPException(status_code=404, detail="Relief rule tidak dijumpai.")
        res = await db.execute(
            select(models.TaxRelief).where(
                models.TaxRelief.user_id == current_user.id,
                models.TaxRelief.assessment_year == payload.assessment_year,
                models.TaxRelief.relief_code == payload.relief_code,
            )
        )
        existing = res.scalars().first()
        if existing:
            existing.claimed_amount = payload.claimed_amount
            existing.eligible_amount = payload.eligible_amount
            existing.source = payload.source
            await db.commit()
            _publish(current_user.id)
            return service.serialize_relief(existing, limit=float(rule.limit_amount) if rule.limit_amount is not None else None)
        row = models.TaxRelief(
            user_id=current_user.id,
            assessment_year=payload.assessment_year,
            relief_rule_id=rule.id,
            relief_code=payload.relief_code,
            name=rule.name,
            claimed_amount=payload.claimed_amount,
            eligible_amount=payload.eligible_amount or payload.claimed_amount,
            source=payload.source,
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)
        _publish(current_user.id)
        return service.serialize_relief(row, limit=float(rule.limit_amount) if rule.limit_amount is not None else None)

    @router.patch("/reliefs/{relief_id}")
    async def update_relief(
        relief_id: int,
        payload: ReliefUpdate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await _get_relief_or_404(db, relief_id, current_user.id)
        for k, v in payload.model_dump(exclude_unset=True).items():
            setattr(row, k, v)
        await db.commit()
        _publish(current_user.id)
        return service.serialize_relief(row)

    async def _get_relief_or_404(db, relief_id, user_id):
        res = await db.execute(
            select(models.TaxRelief).where(
                models.TaxRelief.id == relief_id,
                models.TaxRelief.user_id == user_id,
            )
        )
        row = res.scalars().first()
        if not row:
            raise HTTPException(status_code=404, detail="Relief tidak dijumpai.")
        return row

    # ── rebates ─────────────────────────────────────────────────────────────
    @router.get("/rebates")
    async def list_rebates(
        assessment_year: int = Query(default=0),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        if assessment_year == 0:
            assessment_year = 2026
        res = await db.execute(
            select(models.TaxRebate).where(
                models.TaxRebate.user_id == current_user.id,
                models.TaxRebate.assessment_year == assessment_year,
            )
        )
        return [service.serialize_rebate(x) for x in res.scalars().all()]

    @router.post("/rebates")
    async def create_rebate(
        payload: RebateCreate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        rules = await tax_engine.get_active_rebate_rules(db, payload.assessment_year)
        rule_map = {r.rule_code: r for r in rules}
        rule = rule_map.get(payload.rebate_code)
        name = rule.name if rule else ("Zakat / Fitrah & Harta" if payload.rebate_code == "rebate_zakat" else payload.rebate_code)
        row = models.TaxRebate(
            user_id=current_user.id,
            assessment_year=payload.assessment_year,
            rebate_rule_id=rule.id if rule else None,
            rebate_code=payload.rebate_code,
            name=name,
            amount=payload.amount,
            source=payload.source,
            transaction_id=payload.transaction_id,
            document_id=payload.document_id,
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)
        _publish(current_user.id)
        return service.serialize_rebate(row)

    @router.patch("/rebates/{rebate_id}")
    async def update_rebate(
        rebate_id: int,
        payload: RebateUpdate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await _get_rebate_or_404(db, rebate_id, current_user.id)
        for k, v in payload.model_dump(exclude_unset=True).items():
            setattr(row, k, v)
        await db.commit()
        _publish(current_user.id)
        return service.serialize_rebate(row)

    @router.delete("/rebates/{rebate_id}")
    async def delete_rebate(
        rebate_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await _get_rebate_or_404(db, rebate_id, current_user.id)
        await db.delete(row)
        await db.commit()
        _publish(current_user.id)
        return {"detail": "Rebat dipadam."}

    async def _get_rebate_or_404(db, rebate_id, user_id):
        res = await db.execute(
            select(models.TaxRebate).where(
                models.TaxRebate.id == rebate_id,
                models.TaxRebate.user_id == user_id,
            )
        )
        row = res.scalars().first()
        if not row:
            raise HTTPException(status_code=404, detail="Rebat tidak dijumpai.")
        return row

    # ── documents ───────────────────────────────────────────────────────────
    @router.get("/documents")
    async def list_documents(
        assessment_year: int = Query(default=0),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        if assessment_year == 0:
            assessment_year = 2026
        res = await db.execute(
            select(models.TaxDocument).where(
                models.TaxDocument.user_id == current_user.id,
                models.TaxDocument.assessment_year == assessment_year,
            )
        )
        return [service.serialize_document(d) for d in res.scalars().all()]

    @router.post("/documents")
    async def upload_document(
        assessment_year: int = Form(...),
        document_type: str = Form("receipt"),
        document_date: Optional[str] = Form(None),
        linked_entity_type: Optional[str] = Form(None),
        linked_entity_id: Optional[int] = Form(None),
        file: UploadFile = File(...),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        payload = await file.read()
        try:
            mime_type, extension = storage_service.validate_receipt_file(file.filename, file.content_type, payload)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        object_key = f"tax/{current_user.id}/{assessment_year}/doc/{uuid4().hex}-{_make_safe_stem(file.filename)}{extension}"
        try:
            storage_service.upload_receipt_object(object_key, payload, mime_type, filename=file.filename)
        except Exception as exc:
            raise HTTPException(status_code=502, detail="Upload failed.") from exc
        row = models.TaxDocument(
            user_id=current_user.id,
            assessment_year=assessment_year,
            document_type=document_type,
            storage_reference=object_key,
            original_filename=file.filename,
            mime_type=mime_type,
            document_date=document_date,
            linked_entity_type=linked_entity_type,
            linked_entity_id=linked_entity_id,
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)
        _publish(current_user.id)
        return service.serialize_document(row)

    @router.get("/documents/{doc_id}")
    async def get_document(
        doc_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await _get_document_or_404(db, doc_id, current_user.id)
        if not row.storage_reference:
            raise HTTPException(status_code=404, detail="Fail tidak dijumpai.")
        payload, content_type = storage_service.download_receipt_object(row.storage_reference)
        filename = row.original_filename or "tax-document"
        return Response(content=payload, media_type=content_type or "application/octet-stream",
                        headers={"Content-Disposition": f'inline; filename="{filename}"'})

    @router.delete("/documents/{doc_id}")
    async def delete_document(
        doc_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await _get_document_or_404(db, doc_id, current_user.id)
        # unlink from reliefs/rebates but do NOT delete the object automatically (user may reuse)
        await db.delete(row)
        await db.commit()
        _publish(current_user.id)
        return {"detail": "Dokumen dipadam."}

    async def _get_document_or_404(db, doc_id, user_id):
        res = await db.execute(
            select(models.TaxDocument).where(
                models.TaxDocument.id == doc_id,
                models.TaxDocument.user_id == user_id,
            )
        )
        row = res.scalars().first()
        if not row:
            raise HTTPException(status_code=404, detail="Dokumen tidak dijumpai.")
        return row

    # ── transaction links ───────────────────────────────────────────────────
    @router.get("/transaction-links")
    async def list_transaction_links(
        assessment_year: int = Query(default=0),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        if assessment_year == 0:
            assessment_year = 2026
        res = await db.execute(
            select(models.TaxTransactionLink).where(
                models.TaxTransactionLink.user_id == current_user.id,
                models.TaxTransactionLink.tax_year == assessment_year,
            )
        )
        return [service.serialize_link(l) for l in res.scalars().all()]

    @router.post("/transaction-links")
    async def create_transaction_link(
        payload: TransactionLinkCreate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        # verify transaction ownership
        tres = await db.execute(
            select(models.Transaction).where(
                models.Transaction.id == payload.transaction_id,
                models.Transaction.user_id == current_user.id,
            )
        )
        if not tres.scalars().first():
            raise HTTPException(status_code=404, detail="Transaksi tidak dijumpai.")
        claim = payload.claim_amount
        row = models.TaxTransactionLink(
            user_id=current_user.id,
            transaction_id=payload.transaction_id,
            tax_year=payload.tax_year,
            tax_type=payload.tax_type,
            tax_category_id=payload.tax_category_id,
            claim_amount=claim or 0,
            status=payload.status,
            document_id=payload.document_id,
        )
        db.add(row)
        try:
            await db.commit()
        except Exception:
            await db.rollback()
            # duplicate link — update existing
            res = await db.execute(
                select(models.TaxTransactionLink).where(
                    models.TaxTransactionLink.transaction_id == payload.transaction_id,
                    models.TaxTransactionLink.tax_year == payload.tax_year,
                    models.TaxTransactionLink.tax_type == payload.tax_type,
                    models.TaxTransactionLink.tax_category_id == payload.tax_category_id,
                )
            )
            row = res.scalars().first()
            if row:
                row.claim_amount = claim or 0
                row.status = payload.status
                row.document_id = payload.document_id
                await db.commit()
        _publish(current_user.id)
        return service.serialize_link(row)

    @router.patch("/transaction-links/{link_id}")
    async def update_transaction_link(
        link_id: int,
        payload: TransactionLinkUpdate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await _get_link_or_404(db, link_id, current_user.id)
        for k, v in payload.model_dump(exclude_unset=True).items():
            setattr(row, k, v)
        await db.commit()
        _publish(current_user.id)
        return service.serialize_link(row)

    async def _get_link_or_404(db, link_id, user_id):
        res = await db.execute(
            select(models.TaxTransactionLink).where(
                models.TaxTransactionLink.id == link_id,
                models.TaxTransactionLink.user_id == user_id,
            )
        )
        row = res.scalars().first()
        if not row:
            raise HTTPException(status_code=404, detail="Pautan tidak dijumpai.")
        return row

    # ── rules (for display / eligibility) ───────────────────────────────────
    @router.get("/rules")
    async def get_rules(
        assessment_year: int = Query(default=0),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        if assessment_year == 0:
            assessment_year = 2026
        brackets = await tax_engine.get_brackets(db, assessment_year)
        reliefs = await tax_engine.get_active_relief_rules(db, assessment_year)
        rebates = await tax_engine.get_active_rebate_rules(db, assessment_year)
        return {
            "assessment_year": assessment_year,
            "source": "HASiL",
            "tax_brackets": brackets,
            "relief_rules": [
                {"code": r.rule_code, "name": r.name, "limit": float(r.limit_amount) if r.limit_amount is not None else None,
                 "doc": r.document_requirement, "group": json.loads(r.eligibility_rule or "{}").get("group", "other")}
                for r in reliefs
            ],
            "rebate_rules": [
                {"code": r.rule_code, "name": r.name, "limit": float(r.limit_amount) if r.limit_amount is not None else None}
                for r in rebates
            ],
        }

    # ── estimate / calculation ──────────────────────────────────────────────
    @router.post("/calculate")
    async def calculate(
        assessment_year: int = Query(default=0),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        if assessment_year == 0:
            assessment_year = 2026
        result = await tax_engine.calculate(db, current_user.id, assessment_year)
        # persist
        calc = models.TaxCalculation(
            user_id=current_user.id,
            assessment_year=assessment_year,
            rule_version=str(assessment_year),
            income_total=result["income_total"],
            relief_total=result["relief_total"],
            chargeable_income=result["chargeable_income"],
            gross_tax=result["gross_tax"],
            rebate_total=result["rebate_total"],
            net_tax=result["net_tax"],
            pcb_total=result["pcb_total"],
            estimated_balance=result["estimated_balance"],
            calculation_json=json.dumps(result),
        )
        db.add(calc)
        await db.commit()
        _publish(current_user.id)
        return result

    # ── readiness ───────────────────────────────────────────────────────────
    @router.get("/readiness")
    async def readiness(
        assessment_year: int = Query(default=0),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        if assessment_year == 0:
            assessment_year = 2026
        profile = await service.get_profile_or_create(db, current_user.id, assessment_year)
        await db.commit()

        ea_res = await db.execute(
            select(models.TaxEAForm).where(
                models.TaxEAForm.user_id == current_user.id,
                models.TaxEAForm.assessment_year == assessment_year,
            )
        )
        ea_forms = list(ea_res.scalars().all())
        income_res = await db.execute(
            select(models.TaxIncome).where(
                models.TaxIncome.user_id == current_user.id,
                models.TaxIncome.assessment_year == assessment_year,
            )
        )
        incomes = list(income_res.scalars().all())
        relief_res = await db.execute(
            select(models.TaxRelief).where(
                models.TaxRelief.user_id == current_user.id,
                models.TaxRelief.assessment_year == assessment_year,
            )
        )
        reliefs = list(relief_res.scalars().all())
        doc_res = await db.execute(
            select(models.TaxDocument).where(
                models.TaxDocument.user_id == current_user.id,
                models.TaxDocument.assessment_year == assessment_year,
            )
        )
        docs = list(doc_res.scalars().all())
        calc_res = await db.execute(
            select(models.TaxCalculation).where(
                models.TaxCalculation.user_id == current_user.id,
                models.TaxCalculation.assessment_year == assessment_year,
            ).order_by(models.TaxCalculation.id.desc()).limit(1)
        )
        calc = calc_res.scalars().first()

        # Items that need attention: reliefs with claimed>0 but no document, or pending links
        attention = []
        reliefs_with_docs = set(d.linked_entity_id for d in docs if d.linked_entity_type == "relief")
        for r in reliefs:
            if (r.claimed_amount or 0) > 0 and r.id not in reliefs_with_docs:
                attention.append({
                    "kind": "relief", "relief_id": r.id, "name": r.name,
                    "amount": float(r.claimed_amount or 0), "issue": "Dokumen sokongan belum dilampirkan",
                })
        # links pending review
        link_res = await db.execute(
            select(models.TaxTransactionLink).where(
                models.TaxTransactionLink.user_id == current_user.id,
                models.TaxTransactionLink.tax_year == assessment_year,
                models.TaxTransactionLink.status == "suggested",
            )
        )
        pending_links = list(link_res.scalars().all())

        checks = {
            "EA reviewed": any(f.review_status == "confirmed" for f in ea_forms),
            "Income reviewed": any(i.status == "confirmed" for i in incomes),
            "Reliefs reviewed": profile.review_status == "complete" or len(reliefs) > 0,
            "PCB reviewed": any((f.pcb_amount or 0) > 0 for f in ea_forms),
            "Documents attached": len(docs) > 0,
            "Tax profile complete": profile.review_status in ("in_review", "complete") or _profile_looks_complete(profile),
            "Final review complete": calc is not None,
        }
        done = sum(1 for v in checks.values() if v)
        score = int(round(done / len(checks) * 100))
        return {
            "assessment_year": assessment_year,
            "score": score,
            "checks": checks,
            "attention": attention,
            "pending_links": len(pending_links),
            "profile_review_status": profile.review_status,
        }

    def _profile_looks_complete(p: models.TaxProfile) -> bool:
        return bool(p.residency_status and p.marital_status and p.income_source)

    # ── delete tax year (does NOT delete original transactions) ─────────────
    @router.delete("/year")
    async def delete_tax_year(
        assessment_year: int = Query(...),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        # collect IDs to delete
        profile = (await db.execute(
            select(models.TaxProfile).where(
                models.TaxProfile.user_id == current_user.id,
                models.TaxProfile.assessment_year == assessment_year,
            )
        )).scalars().first()

        # documents (unlink only, keep storage)
        docs = (await db.execute(
            select(models.TaxDocument).where(
                models.TaxDocument.user_id == current_user.id,
                models.TaxDocument.assessment_year == assessment_year,
            )
        )).scalars().all()
        for d in docs:
            d.linked_entity_type = None
            d.linked_entity_id = None

        # delete reliefs (and items via cascade)
        reliefs = (await db.execute(
            select(models.TaxRelief).where(
                models.TaxRelief.user_id == current_user.id,
                models.TaxRelief.assessment_year == assessment_year,
            )
        )).scalars().all()
        for r in reliefs:
            await db.delete(r)

        rebates = (await db.execute(
            select(models.TaxRebate).where(
                models.TaxRebate.user_id == current_user.id,
                models.TaxRebate.assessment_year == assessment_year,
            )
        )).scalars().all()
        for r in rebates:
            await db.delete(r)

        incomes = (await db.execute(
            select(models.TaxIncome).where(
                models.TaxIncome.user_id == current_user.id,
                models.TaxIncome.assessment_year == assessment_year,
            )
        )).scalars().all()
        for i in incomes:
            await db.delete(i)

        eas = (await db.execute(
            select(models.TaxEAForm).where(
                models.TaxEAForm.user_id == current_user.id,
                models.TaxEAForm.assessment_year == assessment_year,
            )
        )).scalars().all()
        for f in eas:
            await db.delete(f)

        employers = (await db.execute(
            select(models.TaxEmployer).where(
                models.TaxEmployer.user_id == current_user.id,
                models.TaxEmployer.assessment_year == assessment_year,
            )
        )).scalars().all()
        for e in employers:
            await db.delete(e)

        links = (await db.execute(
            select(models.TaxTransactionLink).where(
                models.TaxTransactionLink.user_id == current_user.id,
                models.TaxTransactionLink.tax_year == assessment_year,
            )
        )).scalars().all()
        for l in links:
            await db.delete(l)

        calcs = (await db.execute(
            select(models.TaxCalculation).where(
                models.TaxCalculation.user_id == current_user.id,
                models.TaxCalculation.assessment_year == assessment_year,
            )
        )).scalars().all()
        for c in calcs:
            await db.delete(c)

        if profile:
            await db.delete(profile)
        await db.commit()
        _publish(current_user.id)
        return {"detail": f"Data cukai YA {assessment_year} dipadam. Transaksi asal tidak disentuh."}

    return router
