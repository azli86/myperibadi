import argparse
import asyncio
from collections import defaultdict
from typing import Any

from sqlalchemy import func, select

import database
import models

SEED_ONLY_HOUSEHOLD_TABLES = {"categories"}
def _household_tables() -> list[tuple[str, Any]]:
    tables = []
    for mapper in models.Base.registry.mappers:
        model = mapper.class_
        table = model.__table__
        if "household_id" in table.c:
            tables.append((table.name, model))
    return sorted(tables, key=lambda item: item[0])


async def _count_for_households(db, model: Any, household_ids: list[int]) -> int:
    if not household_ids:
        return 0
    result = await db.execute(
        select(func.count()).select_from(model).where(model.household_id.in_(household_ids))
    )
    return int(result.scalar_one() or 0)


async def _count_category_keywords(db, household_ids: list[int]) -> int:
    if not household_ids:
        return 0
    result = await db.execute(
        select(func.count())
        .select_from(models.CategoryKeyword)
        .join(models.Category, models.CategoryKeyword.category_id == models.Category.id)
        .where(models.Category.household_id.in_(household_ids))
    )
    return int(result.scalar_one() or 0)


async def run_audit() -> int:
    household_tables = _household_tables()
    real_household_tables = [
        (name, model)
        for name, model in household_tables
        if name not in SEED_ONLY_HOUSEHOLD_TABLES and name != "household_members"
    ]

    async with database.SessionLocal() as db:
        null_default_result = await db.execute(
            select(func.count()).select_from(models.User).where(models.User.default_household_id.is_(None))
        )
        null_default_users = int(null_default_result.scalar_one() or 0)

        membership_counts_result = await db.execute(
            select(models.HouseholdMember.user_id, func.count(models.HouseholdMember.id))
            .group_by(models.HouseholdMember.user_id)
        )
        membership_counts = dict(membership_counts_result.all())
        total_users_result = await db.execute(select(models.User.id))
        user_ids = [row[0] for row in total_users_result.all()]
        users_with_membership_count_not_one = sum(
            1 for user_id in user_ids if int(membership_counts.get(user_id, 0)) != 1
        )

        shared_households_result = await db.execute(
            select(
                models.HouseholdMember.household_id,
                func.count(func.distinct(models.HouseholdMember.user_id)).label("user_count"),
            )
            .group_by(models.HouseholdMember.household_id)
            .having(func.count(func.distinct(models.HouseholdMember.user_id)) > 1)
        )
        shared_households = shared_households_result.all()

        member_rows_result = await db.execute(
            select(
                models.HouseholdMember.user_id,
                models.HouseholdMember.household_id,
                models.User.default_household_id,
            )
            .join(models.User, models.User.id == models.HouseholdMember.user_id)
        )
        non_default_by_user: dict[str, dict[str, Any]] = defaultdict(
            lambda: {"default_household_id": None, "household_ids": []}
        )
        non_default_household_ids: list[int] = []
        for user_id, household_id, default_household_id in member_rows_result.all():
            if default_household_id and household_id != default_household_id:
                non_default_by_user[user_id]["default_household_id"] = default_household_id
                non_default_by_user[user_id]["household_ids"].append(household_id)
                non_default_household_ids.append(household_id)

        non_default_household_ids = sorted(set(non_default_household_ids))
        table_counts = []
        for table_name, model in household_tables:
            table_counts.append((table_name, await _count_for_households(db, model, non_default_household_ids)))
        category_keyword_count = await _count_category_keywords(db, non_default_household_ids)

        real_counts = []
        for table_name, model in real_household_tables:
            count = await _count_for_households(db, model, non_default_household_ids)
            if count:
                real_counts.append((table_name, count))

        classification = "SAFE_SEEDED_ONLY"
        if shared_households or real_counts:
            classification = "HAS_REAL_DATA_ABORT"
        mapped_household_tables = {name for name, _ in household_tables}
        if "categories" not in mapped_household_tables:
            classification = "UNKNOWN_ABORT"

        print(f"users_default_household_null: {null_default_users}")
        print(f"users_membership_count_not_one: {users_with_membership_count_not_one}")
        print(f"shared_households: {len(shared_households)}")
        for household_id, user_count in shared_households:
            print(f"  household_id={household_id} users={user_count}")
        print(f"users_with_non_default_households: {len(non_default_by_user)}")
        print(f"non_default_households: {len(non_default_household_ids)}")
        for user_id in sorted(non_default_by_user):
            info = non_default_by_user[user_id]
            print(
                f"  user_id={user_id} default_household_id={info['default_household_id']} "
                f"non_default_household_ids={sorted(info['household_ids'])}"
            )
        print("non_default_household_table_counts:")
        for table_name, count in table_counts:
            print(f"  {table_name}: {count}")
        print(f"  category_keywords: {category_keyword_count}")
        print("blocking_real_data_counts:")
        if real_counts:
            for table_name, count in real_counts:
                print(f"  {table_name}: {count}")
        else:
            print("  none: 0")
        print(f"classification: {classification}")
        await db.rollback()
        return 0 if classification == "SAFE_SEEDED_ONLY" else 2


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit duplicate legacy households without modifying data.")
    parser.parse_args()
    raise SystemExit(asyncio.run(run_audit()))


if __name__ == "__main__":
    main()
