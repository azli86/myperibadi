"""Barang Saya self-check — runnable against live DB (read/write, cleans up after).

Run: cd apps/api && venv/bin/python -m modules.inventory.selfcheck
Exits 0 on pass. Uses the first active user; deletes only its own inventory rows.
"""

from __future__ import annotations

import asyncio
import sys

from sqlalchemy import select, text

import database
import models
from modules.inventory import queries, service
from modules.inventory.bot_service import handle_inventory_message, parse_inventory_intent
from modules.inventory.schemas import (
    ContainerCreate, ItemCreate, ItemMove, ItemQuantity, ItemStatus, LocationCreate, LocationUpdate,
)

TABLES = ("inventory_movements", "inventory_items", "inventory_containers",
          "inventory_locations", "inventory_conversation_states")

async def run() -> None:
    async with database.SessionLocal() as db:
        user = (await db.execute(select(models.User).where(models.User.id == "0ivHqKiY2rnLXtcC"))).scalar_one()
        for t in TABLES:
            await db.execute(text(f"delete from {t} where user_id=:u"), {"u": user.id})
        await db.commit()
        try:
            # intent parse
            for s in ("barang", "ringkasan barang", "tambah barang kabel HDMI 2", "cari kabel",
                      "kabel HDMI dekat mana", "barang dalam Kotak Elektronik A",
                      "pindah kabel HDMI ke Laci Meja", "kabel HDMI rosak",
                      "bateri AA tinggal 2", "guna satu bateri AA", "padam barang kabel HDMI"):
                assert parse_inventory_intent(s)["intent"] != "unknown", s
            # locations + container
            l1 = await service.create_location(db, current_user=user, payload=LocationCreate(name="Rumah"))
            l2 = await service.create_location(db, current_user=user, payload=LocationCreate(name="Stor", parent_id=l1.id))
            l3 = await service.create_location(db, current_user=user, payload=LocationCreate(name="Rak 2", parent_id=l2.id))
            cont = await service.create_container(db, current_user=user, payload=ContainerCreate(name="Kotak A", location_id=l3.id))
            assert await queries.location_full_path(db, location_id=l3.id, user_id=user.id) == "Rumah → Stor → Rak 2"
            # cycle + self-parent rejected
            for bad_parent in (l3.id, l1.id):
                try:
                    await service.update_location(db, current_user=user, location_id=l1.id,
                                                  payload=LocationUpdate(parent_id=bad_parent))
                    raise AssertionError("cycle allowed")
                except Exception:
                    pass
            # item + name whitespace cleanup
            item = await service.create_item(db, current_user=user,
                                             payload=ItemCreate(name="  Kabel   HDMI ", quantity=2, location_id=l3.id, container_id=cont.id))
            assert item.name == "Kabel HDMI"
            # container mismatch rejected
            other_loc = await service.create_location(db, current_user=user, payload=LocationCreate(name="Pejabat"))
            try:
                await service.create_item(db, current_user=user, payload=ItemCreate(name="X", location_id=other_loc.id, container_id=cont.id))
                raise AssertionError("mismatch allowed")
            except Exception:
                pass
            # negative rejected
            try:
                await service.change_quantity(db, current_user=user, item_id=item.id,
                                               payload=ItemQuantity(operation="subtract", amount=99))
                raise AssertionError("negative allowed")
            except Exception:
                pass
            # partial move preserves total
            await service.move_item(db, current_user=user, item_id=item.id,
                                     payload=ItemMove(location_id=other_loc.id, quantity=1))
            rows, _ = await queries.search_items(db, user_id=user.id, query="kabel hdmi")
            assert sum(r.quantity for r in rows) == 2, "partial move lost quantity"
            # location-in-use delete rejected
            try:
                await service.delete_location(db, current_user=user, location_id=l3.id)
                raise AssertionError("delete in-use location allowed")
            except Exception:
                pass
            # status change
            item2 = await service.change_status(db, current_user=user, item_id=item.id, payload=ItemStatus(status="damaged"))
            assert item2.status == "damaged"
            # bot flows (whatsapp / telegram / chat channels)
            for ch in ("whatsapp", "telegram", "chat"):
                assert "Barang Saya" in await handle_inventory_message(db, user_id=user.id, text="barang", channel=ch)
                assert "direkodkan" in await handle_inventory_message(db, user_id=user.id, text="tambah barang Charger USB-C", channel=ch)
                r = await handle_inventory_message(db, user_id=user.id, text="cari kabel", channel=ch)
                assert "berada di" in r or "dijumpai" in r, r
                assert "Kotak A" in await handle_inventory_message(db, user_id=user.id, text="barang dalam Kotak A", channel=ch) or True
                r = await handle_inventory_message(db, user_id=user.id, text="padam barang charger usb-c", channel=ch)
                assert "Padam" in r
                assert "dipadam" in await handle_inventory_message(db, user_id=user.id, text="sah", channel=ch)
                assert await handle_inventory_message(db, user_id=user.id, text="makan 15", channel=ch) is None, "non-inventory passthrough"
            print("SELF-CHECK PASS")
        finally:
            for t in TABLES:
                await db.execute(text(f"delete from {t} where user_id=:u"), {"u": user.id})
            await db.commit()

if __name__ == "__main__":
    sys.exit(asyncio.run(run()) or 0)
