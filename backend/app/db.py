"""SQLite persistence (any SQLAlchemy URL works via OHMEN_DATABASE_URL, e.g. PostgreSQL).

Configuration (assets, connections, advisories, tasks, saved scenarios) is stored as JSON
documents. Events and audit records are append-only tables.
"""

from __future__ import annotations

from sqlalchemy import JSON, Integer, String, create_engine, delete, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column


class Base(DeclarativeBase):
    pass


class Document(Base):
    __tablename__ = "documents"
    kind: Mapped[str] = mapped_column(String(32), primary_key=True)
    id: Mapped[str] = mapped_column(String(96), primary_key=True)
    data: Mapped[dict] = mapped_column(JSON)


class EventRow(Base):
    __tablename__ = "events"
    seq: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id: Mapped[str] = mapped_column(String(32), unique=True)
    ts: Mapped[str] = mapped_column(String(40))
    data: Mapped[dict] = mapped_column(JSON)


class AuditRow(Base):
    __tablename__ = "audit"
    seq: Mapped[int] = mapped_column(Integer, primary_key=True)
    data: Mapped[dict] = mapped_column(JSON)


class Database:
    def __init__(self, url: str):
        kwargs = {"connect_args": {"check_same_thread": False}} if url.startswith("sqlite") else {}
        self.engine = create_engine(url, **kwargs)
        Base.metadata.create_all(self.engine)

    def documents(self, kind: str) -> list[dict]:
        with Session(self.engine) as s:
            return [row.data for row in s.scalars(select(Document).where(Document.kind == kind).order_by(Document.id))]

    def upsert(self, kind: str, doc_id: str, data: dict) -> None:
        with Session(self.engine) as s:
            s.merge(Document(kind=kind, id=doc_id, data=data))
            s.commit()

    def upsert_many(self, kind: str, docs: list[dict]) -> None:
        with Session(self.engine) as s:
            for d in docs:
                s.merge(Document(kind=kind, id=d["id"], data=d))
            s.commit()

    def delete_document(self, kind: str, doc_id: str) -> None:
        with Session(self.engine) as s:
            s.execute(delete(Document).where(Document.kind == kind, Document.id == doc_id))
            s.commit()

    def events(self) -> list[dict]:
        with Session(self.engine) as s:
            return [row.data for row in s.scalars(select(EventRow).order_by(EventRow.seq))]

    def add_event(self, event: dict) -> None:
        with Session(self.engine) as s:
            s.add(EventRow(id=event["id"], ts=event["ts"], data=event))
            s.commit()

    def audit(self) -> list[dict]:
        with Session(self.engine) as s:
            return [row.data for row in s.scalars(select(AuditRow).order_by(AuditRow.seq))]

    def add_audit(self, record: dict) -> None:
        with Session(self.engine) as s:
            s.add(AuditRow(seq=record["seq"], data=record))
            s.commit()

    def wipe(self) -> None:
        with Session(self.engine) as s:
            for table in (Document, EventRow, AuditRow):
                s.execute(delete(table))
            s.commit()
