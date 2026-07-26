import os
from sqlalchemy.engine import URL
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from dotenv import load_dotenv

load_dotenv()

DB_DIALECT = os.getenv("DB_DIALECT", "mysql").strip().lower()
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

DB_HOST = os.getenv("DB_HOST", "hs2.digitalport.my")
DB_PORT = os.getenv("DB_PORT", "5432" if DB_DIALECT in {"postgres", "postgresql"} else "3306")
DB_NAME = os.getenv("DB_NAME", "expenseclaw")
DB_USER = os.getenv("DB_USER", "expenseclaw")
DB_PASS = os.getenv("DB_PASS", "password")

if DATABASE_URL and "${" not in DATABASE_URL:
    DB_URL = DATABASE_URL
elif DB_DIALECT in {"postgres", "postgresql"}:
    DB_URL = URL.create(
        "postgresql+asyncpg",
        username=DB_USER,
        password=DB_PASS,
        host=DB_HOST,
        port=int(DB_PORT),
        database=DB_NAME,
    )
else:
    DB_URL = URL.create(
        "mysql+aiomysql",
        username=DB_USER,
        password=DB_PASS,
        host=DB_HOST,
        port=int(DB_PORT),
        database=DB_NAME,
    )

SQL_ECHO = os.getenv("SQL_ECHO", "false").strip().lower() == "true"
DB_POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "10"))
DB_MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", "20"))
DB_POOL_TIMEOUT = int(os.getenv("DB_POOL_TIMEOUT", "10"))
DB_POOL_RECYCLE = int(os.getenv("DB_POOL_RECYCLE", "1800"))

engine = create_async_engine(
    DB_URL,
    echo=SQL_ECHO,
    pool_size=DB_POOL_SIZE,
    max_overflow=DB_MAX_OVERFLOW,
    pool_timeout=DB_POOL_TIMEOUT,
    pool_recycle=DB_POOL_RECYCLE,
    pool_pre_ping=True,
)
SessionLocal = async_sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with SessionLocal() as session:
        yield session
