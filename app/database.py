from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base

engine = create_engine("sqlite:///tradequote.db", echo=False)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def init_db():
    Base.metadata.create_all(engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()