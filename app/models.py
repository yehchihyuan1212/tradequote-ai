from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Customer(Base):
    __tablename__ = "customers"
    id: Mapped[int] = mapped_column(primary_key=True)
    company: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(200), index=True)
    contact: Mapped[str | None] = mapped_column(String(120))
    country: Mapped[str | None] = mapped_column(String(80))
    language: Mapped[str] = mapped_column(String(40), default="English")
    industry: Mapped[str | None] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(default=datetime.now)

    emails: Mapped[list["Email"]] = relationship(back_populates="customer")


class Product(Base):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(primary_key=True)
    sku: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    unit_price: Mapped[float] = mapped_column(Float)
    moq: Mapped[int] = mapped_column(Integer)
    lead_days: Mapped[int] = mapped_column(Integer)
    weight_kg: Mapped[float | None] = mapped_column(Float)
    hs_code: Mapped[str | None] = mapped_column(String(20))
    aliases: Mapped[str | None] = mapped_column(Text)


class PriceSetting(Base):
    __tablename__ = "price_settings"
    id: Mapped[int] = mapped_column(primary_key=True)
    profit_margin: Mapped[float] = mapped_column(Float, default=0.20)
    local_charges: Mapped[float] = mapped_column(Float, default=120.0)
    insurance: Mapped[float] = mapped_column(Float, default=80.0)
    bank_charges: Mapped[float] = mapped_column(Float, default=35.0)
    usd_twd: Mapped[float] = mapped_column(Float, default=29.6)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.now,
                                                 onupdate=datetime.now)


class Freight(Base):
    __tablename__ = "freight"
    id: Mapped[int] = mapped_column(primary_key=True)
    destination: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    port: Mapped[str | None] = mapped_column(String(80))
    cost_usd: Mapped[float] = mapped_column(Float)
    transit_days: Mapped[int | None] = mapped_column(Integer)


class Email(Base):
    __tablename__ = "emails"
    id: Mapped[int] = mapped_column(primary_key=True)
    message_id: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    sender_name: Mapped[str | None] = mapped_column(String(200))
    sender_email: Mapped[str] = mapped_column(String(200), index=True)
    subject: Mapped[str | None] = mapped_column(String(500))
    body: Mapped[str] = mapped_column(Text)
    received_at: Mapped[str | None] = mapped_column(String(120))
    fetched_at: Mapped[datetime] = mapped_column(default=datetime.now)
    viewed_at: Mapped[datetime | None] = mapped_column(DateTime)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime)
    ignored_at: Mapped[datetime | None] = mapped_column(DateTime)

    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id"))
    customer: Mapped["Customer"] = relationship(back_populates="emails")
    inquiry: Mapped["Inquiry"] = relationship(back_populates="email", uselist=False)


class Inquiry(Base):
    __tablename__ = "inquiries"
    id: Mapped[int] = mapped_column(primary_key=True)
    email_id: Mapped[int] = mapped_column(ForeignKey("emails.id"), unique=True)

    intent: Mapped[str] = mapped_column(String(40), index=True)
    confidence: Mapped[int] = mapped_column(Integer)
    company: Mapped[str | None] = mapped_column(String(200))
    contact: Mapped[str | None] = mapped_column(String(120))
    product_text: Mapped[str | None] = mapped_column(String(200))
    quantity: Mapped[int | None] = mapped_column(Integer)
    destination: Mapped[str | None] = mapped_column(String(80))
    incoterm: Mapped[str | None] = mapped_column(String(10))
    summary: Mapped[str | None] = mapped_column(Text)
    model_name: Mapped[str] = mapped_column(String(80))
    analysed_at: Mapped[datetime] = mapped_column(default=datetime.now)
    reviewed: Mapped[bool] = mapped_column(Boolean, default=False)
    corrected_intent: Mapped[str | None] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20), default="analysed", index=True) 

    email: Mapped["Email"] = relationship(back_populates="inquiry")
    quotation: Mapped["Quotation"] = relationship(back_populates="inquiry",
                                                  uselist=False)


class Quotation(Base):
    __tablename__ = "quotations"
    id: Mapped[int] = mapped_column(primary_key=True)
    inquiry_id: Mapped[int] = mapped_column(ForeignKey("inquiries.id"), unique=True)
    quote_no: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    quantity: Mapped[int] = mapped_column(Integer)
    destination: Mapped[str] = mapped_column(String(80))

    cost: Mapped[float] = mapped_column(Float)
    exw: Mapped[float] = mapped_column(Float)
    fca: Mapped[float] = mapped_column(Float)
    fob: Mapped[float] = mapped_column(Float)
    cfr: Mapped[float] = mapped_column(Float)
    cif: Mapped[float] = mapped_column(Float)
    cpt: Mapped[float] = mapped_column(Float)
    cip: Mapped[float] = mapped_column(Float)
    unit_cif: Mapped[float] = mapped_column(Float)
    margin_used: Mapped[float] = mapped_column(Float)
    freight_used: Mapped[float] = mapped_column(Float)

    status: Mapped[str] = mapped_column(String(40), default="draft")
    draft_id: Mapped[str | None] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(default=datetime.now)

    inquiry: Mapped["Inquiry"] = relationship(back_populates="quotation")
    product: Mapped["Product"] = relationship()
    
class Draft(Base):
    __tablename__ = "drafts"

    id: Mapped[int] = mapped_column(primary_key=True)
    quotation_id: Mapped[int | None] = mapped_column(ForeignKey("quotations.id"))
    inquiry_id: Mapped[int] = mapped_column(ForeignKey("inquiries.id"), unique=True)

    to_email: Mapped[str] = mapped_column(String(200))
    subject: Mapped[str] = mapped_column(String(500))
    body: Mapped[str] = mapped_column(Text)

    status: Mapped[str] = mapped_column(String(20), default="draft")
    gmail_draft_id: Mapped[str | None] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.now, onupdate=datetime.now)

    inquiry: Mapped["Inquiry"] = relationship()
    quotation: Mapped["Quotation"] = relationship()