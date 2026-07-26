"""My Vehicle HTTP routes — factory avoids circular imports with main.get_current_user."""

from __future__ import annotations

from typing import Any, Callable, Optional

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

import database
import models
from modules.vehicles import queries, service
from modules.vehicles.schemas import (
    DocumentCreate,
    DocumentUpdate,
    ExpenseCreate,
    ExpenseUpdate,
    FuelLogCreate,
    FuelLogUpdate,
    MaintenanceCreate,
    MaintenanceUpdate,
    OdometerCreate,
    ReminderCreate,
    ReminderUpdate,
    VehicleCreate,
    VehicleUpdate,
)


def create_vehicles_router(*, get_current_user: Callable[..., Any]) -> APIRouter:
    router = APIRouter(prefix="/vehicles", tags=["vehicles"])

    # ── list / create ────────────────────────────────────────────────────────
    @router.get("")
    async def list_vehicles(
        include_inactive: bool = Query(default=False),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        household_id = await queries.ensure_household(db, current_user)
        rows = await queries.list_vehicles(db, household_id=household_id, include_inactive=include_inactive)
        return [service.serialize_vehicle(v) for v in rows]

    @router.post("")
    async def create_vehicle(
        payload: VehicleCreate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.create_vehicle(db, current_user=current_user, payload=payload)
        return service.serialize_vehicle(row)

    # Static paths BEFORE /{vehicle_id}
    @router.get("/summary")
    async def household_summary(
        month_key: Optional[str] = Query(default=None),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        return await service.build_vehicle_summary(db, current_user=current_user, month_key=month_key)

    @router.get("/reminders/due")
    async def household_reminders_due(
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        return await service.build_due_reminders(db, current_user=current_user)

    @router.get("/dashboard/overdue")
    async def dashboard_overdue(
        limit: int = Query(default=3, ge=1, le=20),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        return await service.build_dashboard_overdue(db, current_user=current_user, limit=limit)

    @router.get("/attachments/{attachment_id}/file")
    async def get_attachment_file(
        attachment_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        payload, content_type, file_name = await service.get_attachment_bytes(
            db, current_user=current_user, attachment_id=attachment_id
        )
        return Response(
            content=payload,
            media_type=content_type,
            headers={"Content-Disposition": f'inline; filename="{file_name}"'},
        )

    @router.delete("/attachments/{attachment_id}")
    async def delete_attachment(
        attachment_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        await service.delete_attachment(db, current_user=current_user, attachment_id=attachment_id)
        return {"ok": True}

    @router.get("/links/by-transaction/{txn_id}")
    async def vehicle_link_by_transaction(
        txn_id: str,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        return await service.get_link_by_transaction(db, current_user=current_user, txn_id=txn_id)

    # ── vehicle detail ───────────────────────────────────────────────────────
    @router.get("/{vehicle_id}")
    async def get_vehicle(
        vehicle_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        household_id = await queries.ensure_household(db, current_user)
        row = await queries.get_vehicle_or_404(db, vehicle_id=vehicle_id, household_id=household_id)
        return service.serialize_vehicle(row)

    @router.patch("/{vehicle_id}")
    async def update_vehicle(
        vehicle_id: int,
        payload: VehicleUpdate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.update_vehicle(db, current_user=current_user, vehicle_id=vehicle_id, payload=payload)
        return service.serialize_vehicle(row)

    @router.delete("/{vehicle_id}")
    async def delete_vehicle(
        vehicle_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        await service.delete_vehicle(db, current_user=current_user, vehicle_id=vehicle_id)
        return {"ok": True}

    @router.get("/{vehicle_id}/summary")
    async def vehicle_summary(
        vehicle_id: int,
        month_key: Optional[str] = Query(default=None),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        return await service.build_vehicle_summary(
            db, current_user=current_user, vehicle_id=vehicle_id, month_key=month_key
        )

    @router.get("/{vehicle_id}/reminders/due")
    async def vehicle_reminders_due(
        vehicle_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        return await service.build_due_reminders(db, current_user=current_user, vehicle_id=vehicle_id)

    # Image
    @router.post("/{vehicle_id}/image")
    async def upload_image(
        vehicle_id: int,
        file: UploadFile = File(...),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.upload_vehicle_image(db, current_user=current_user, vehicle_id=vehicle_id, file=file)
        return service.serialize_vehicle(row)

    @router.get("/{vehicle_id}/image")
    async def get_image(
        vehicle_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        payload, content_type, file_name = await service.get_vehicle_image_bytes(
            db, current_user=current_user, vehicle_id=vehicle_id
        )
        return Response(
            content=payload,
            media_type=content_type,
            headers={"Content-Disposition": f'inline; filename="{file_name}"'},
        )

    @router.delete("/{vehicle_id}/image")
    async def delete_image(
        vehicle_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.delete_vehicle_image(db, current_user=current_user, vehicle_id=vehicle_id)
        return service.serialize_vehicle(row)

    # Fuel
    @router.get("/{vehicle_id}/fuel")
    async def list_fuel(
        vehicle_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        household_id = await queries.ensure_household(db, current_user)
        await queries.get_vehicle_or_404(db, vehicle_id=vehicle_id, household_id=household_id)
        rows = await queries.list_fuel_logs(db, vehicle_id=vehicle_id, household_id=household_id)
        refs = await service._txn_ref_map(
            db, [int(r.transaction_id) for r in rows if r.transaction_id]
        )
        return [
            service.serialize_fuel(
                r, txn_ref=refs.get(int(r.transaction_id)) if r.transaction_id else None
            )
            for r in rows
        ]

    @router.post("/{vehicle_id}/fuel")
    async def create_fuel(
        vehicle_id: int,
        payload: FuelLogCreate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.create_fuel_log(db, current_user=current_user, vehicle_id=vehicle_id, payload=payload)
        return service.serialize_fuel(row)

    @router.patch("/{vehicle_id}/fuel/{fuel_log_id}")
    async def update_fuel(
        vehicle_id: int,
        fuel_log_id: int,
        payload: FuelLogUpdate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.update_fuel_log(
            db, current_user=current_user, vehicle_id=vehicle_id, fuel_log_id=fuel_log_id, payload=payload
        )
        return service.serialize_fuel(row)

    @router.delete("/{vehicle_id}/fuel/{fuel_log_id}")
    async def delete_fuel(
        vehicle_id: int,
        fuel_log_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        await service.delete_fuel_log(
            db, current_user=current_user, vehicle_id=vehicle_id, fuel_log_id=fuel_log_id
        )
        return {"ok": True}

    @router.post("/{vehicle_id}/fuel/{fuel_log_id}/receipt")
    async def fuel_receipt(
        vehicle_id: int,
        fuel_log_id: int,
        file: UploadFile = File(...),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        att = await service.upload_parent_file(
            db, current_user=current_user, vehicle_id=vehicle_id, kind="fuel", parent_id=fuel_log_id, file=file
        )
        return service.serialize_attachment(att)

    # Expenses
    @router.get("/{vehicle_id}/expenses")
    async def list_expenses(
        vehicle_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        household_id = await queries.ensure_household(db, current_user)
        await queries.get_vehicle_or_404(db, vehicle_id=vehicle_id, household_id=household_id)
        rows = await queries.list_expenses(db, vehicle_id=vehicle_id, household_id=household_id)
        refs = await service._txn_ref_map(
            db, [int(r.transaction_id) for r in rows if r.transaction_id]
        )
        return [
            service.serialize_expense(
                r, txn_ref=refs.get(int(r.transaction_id)) if r.transaction_id else None
            )
            for r in rows
        ]

    @router.post("/{vehicle_id}/expenses")
    async def create_expense(
        vehicle_id: int,
        payload: ExpenseCreate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.create_expense(db, current_user=current_user, vehicle_id=vehicle_id, payload=payload)
        return service.serialize_expense(row)

    @router.patch("/{vehicle_id}/expenses/{expense_id}")
    async def update_expense(
        vehicle_id: int,
        expense_id: int,
        payload: ExpenseUpdate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.update_expense(
            db, current_user=current_user, vehicle_id=vehicle_id, expense_id=expense_id, payload=payload
        )
        return service.serialize_expense(row)

    @router.delete("/{vehicle_id}/expenses/{expense_id}")
    async def delete_expense(
        vehicle_id: int,
        expense_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        await service.delete_expense(
            db, current_user=current_user, vehicle_id=vehicle_id, expense_id=expense_id
        )
        return {"ok": True}

    @router.post("/{vehicle_id}/expenses/{expense_id}/receipt")
    async def expense_receipt(
        vehicle_id: int,
        expense_id: int,
        file: UploadFile = File(...),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        att = await service.upload_parent_file(
            db, current_user=current_user, vehicle_id=vehicle_id, kind="expenses", parent_id=expense_id, file=file
        )
        return service.serialize_attachment(att)

    # Maintenance
    @router.get("/{vehicle_id}/maintenance")
    async def list_maintenance(
        vehicle_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        household_id = await queries.ensure_household(db, current_user)
        await queries.get_vehicle_or_404(db, vehicle_id=vehicle_id, household_id=household_id)
        rows = await queries.list_maintenance(db, vehicle_id=vehicle_id, household_id=household_id)
        refs = await service._txn_ref_map(
            db, [int(r.transaction_id) for r in rows if r.transaction_id]
        )
        return [
            service.serialize_maintenance(
                r, txn_ref=refs.get(int(r.transaction_id)) if r.transaction_id else None
            )
            for r in rows
        ]

    @router.post("/{vehicle_id}/maintenance")
    async def create_maintenance(
        vehicle_id: int,
        payload: MaintenanceCreate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.create_maintenance(
            db, current_user=current_user, vehicle_id=vehicle_id, payload=payload
        )
        return service.serialize_maintenance(row)

    @router.patch("/{vehicle_id}/maintenance/{maintenance_id}")
    async def update_maintenance(
        vehicle_id: int,
        maintenance_id: int,
        payload: MaintenanceUpdate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.update_maintenance(
            db,
            current_user=current_user,
            vehicle_id=vehicle_id,
            maintenance_id=maintenance_id,
            payload=payload,
        )
        return service.serialize_maintenance(row)

    @router.delete("/{vehicle_id}/maintenance/{maintenance_id}")
    async def delete_maintenance(
        vehicle_id: int,
        maintenance_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        await service.delete_maintenance(
            db, current_user=current_user, vehicle_id=vehicle_id, maintenance_id=maintenance_id
        )
        return {"ok": True}

    @router.post("/{vehicle_id}/maintenance/{maintenance_id}/receipt")
    async def maintenance_receipt(
        vehicle_id: int,
        maintenance_id: int,
        file: UploadFile = File(...),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        att = await service.upload_parent_file(
            db,
            current_user=current_user,
            vehicle_id=vehicle_id,
            kind="maintenance",
            parent_id=maintenance_id,
            file=file,
        )
        return service.serialize_attachment(att)

    # Documents
    @router.get("/{vehicle_id}/documents")
    async def list_documents(
        vehicle_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        household_id = await queries.ensure_household(db, current_user)
        await queries.get_vehicle_or_404(db, vehicle_id=vehicle_id, household_id=household_id)
        rows = await queries.list_documents(db, vehicle_id=vehicle_id, household_id=household_id)
        return [service.serialize_document(r) for r in rows]

    @router.post("/{vehicle_id}/documents")
    async def create_document(
        vehicle_id: int,
        payload: DocumentCreate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.create_document(db, current_user=current_user, vehicle_id=vehicle_id, payload=payload)
        return service.serialize_document(row)

    @router.patch("/{vehicle_id}/documents/{document_id}")
    async def update_document(
        vehicle_id: int,
        document_id: int,
        payload: DocumentUpdate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.update_document(
            db, current_user=current_user, vehicle_id=vehicle_id, document_id=document_id, payload=payload
        )
        return service.serialize_document(row)

    @router.delete("/{vehicle_id}/documents/{document_id}")
    async def delete_document(
        vehicle_id: int,
        document_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        await service.delete_document(
            db, current_user=current_user, vehicle_id=vehicle_id, document_id=document_id
        )
        return {"ok": True}

    @router.post("/{vehicle_id}/documents/{document_id}/file")
    async def document_file(
        vehicle_id: int,
        document_id: int,
        file: UploadFile = File(...),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        att = await service.upload_parent_file(
            db,
            current_user=current_user,
            vehicle_id=vehicle_id,
            kind="documents",
            parent_id=document_id,
            file=file,
        )
        return service.serialize_attachment(att)

    # Reminders CRUD
    @router.get("/{vehicle_id}/reminders")
    async def list_reminders(
        vehicle_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        household_id = await queries.ensure_household(db, current_user)
        vehicle = await queries.get_vehicle_or_404(db, vehicle_id=vehicle_id, household_id=household_id)
        rows = await queries.list_reminders(
            db, household_id=household_id, vehicle_id=vehicle_id, statuses=("pending", "completed", "dismissed")
        )
        return [service.serialize_reminder(r, vehicle=vehicle) for r in rows]

    @router.post("/{vehicle_id}/reminders")
    async def create_reminder(
        vehicle_id: int,
        payload: ReminderCreate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        vehicle = await queries.get_vehicle_or_404(
            db,
            vehicle_id=vehicle_id,
            household_id=await queries.ensure_household(db, current_user),
        )
        row = await service.create_reminder(db, current_user=current_user, vehicle_id=vehicle_id, payload=payload)
        return service.serialize_reminder(row, vehicle=vehicle)

    @router.patch("/{vehicle_id}/reminders/{reminder_id}")
    async def update_reminder(
        vehicle_id: int,
        reminder_id: int,
        payload: ReminderUpdate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        household_id = await queries.ensure_household(db, current_user)
        vehicle = await queries.get_vehicle_or_404(db, vehicle_id=vehicle_id, household_id=household_id)
        row = await service.update_reminder(
            db, current_user=current_user, vehicle_id=vehicle_id, reminder_id=reminder_id, payload=payload
        )
        return service.serialize_reminder(row, vehicle=vehicle)

    # Odometer
    @router.post("/{vehicle_id}/odometer")
    async def create_odometer(
        vehicle_id: int,
        payload: OdometerCreate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.create_odometer(db, current_user=current_user, vehicle_id=vehicle_id, payload=payload)
        return service.serialize_odometer(row)

    return router
