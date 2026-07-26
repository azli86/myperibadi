from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc

from database import get_db
from models import Donation
from schemas import DonationResponse

router = APIRouter()


@router.post("/checkout")
async def create_checkout_session():
    raise HTTPException(
        status_code=410,
        detail="Card donations are no longer available. Please use the TNG QR on the support page.",
    )


@router.get("", response_model=list[DonationResponse])
async def get_recent_donations(limit: int = 10, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Donation)
        .filter(Donation.status == "paid")
        .order_by(desc(Donation.created_at))
        .limit(limit)
    )
    return result.scalars().all()
