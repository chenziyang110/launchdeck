"""HTTP API and process entry point for the inventory sample."""

from __future__ import annotations

import os
import sqlite3
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field

from . import __version__
from .db import (
    get_item,
    initialize_database,
    insert_item,
    list_items,
    resolve_database_path,
)


class InventoryItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sku: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=1, max_length=120)
    quantity: int = Field(ge=0, le=1_000_000)
    location: str = Field(min_length=1, max_length=32)


class InventoryResponse(BaseModel):
    items: list[InventoryItem]
    count: int


class HealthResponse(BaseModel):
    status: str
    service: str
    database: str
    seededItems: int


def create_app(database_path: str | None = None) -> FastAPI:
    """Build an app with an injectable SQLite path for isolated native tests."""

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        selected_path = resolve_database_path(database_path)
        initialize_database(selected_path)
        application.state.database_path = selected_path
        yield

    application = FastAPI(
        title="FastAPI Inventory",
        version=__version__,
        description="A deterministic inventory API backed by local SQLite.",
        lifespan=lifespan,
    )

    def database_for(request: Request):
        return request.app.state.database_path

    @application.get("/health", response_model=HealthResponse)
    def health(request: Request) -> HealthResponse:
        database_path = database_for(request)
        items = list_items(database_path)
        return HealthResponse(
            status="ok",
            service="fastapi-inventory",
            database="sqlite",
            seededItems=sum(
                item["sku"].startswith(("KB-", "HB-", "LS-")) for item in items
            ),
        )

    @application.get("/api/items", response_model=InventoryResponse)
    def items(request: Request) -> InventoryResponse:
        records = list_items(database_for(request))
        return InventoryResponse(items=records, count=len(records))

    @application.get("/api/items/{sku}", response_model=InventoryItem)
    def item(sku: str, request: Request) -> InventoryItem:
        record = get_item(database_for(request), sku)
        if record is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Item {sku!r} was not found",
            )
        return InventoryItem(**record)

    @application.post(
        "/api/items",
        response_model=InventoryItem,
        status_code=status.HTTP_201_CREATED,
    )
    def add_item(payload: InventoryItem, request: Request) -> InventoryItem:
        try:
            record = insert_item(
                database_for(request),
                payload.model_dump(),
            )
        except sqlite3.IntegrityError as error:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Item {payload.sku!r} already exists",
            ) from error
        return InventoryItem(**record)

    return application


app = create_app()


def run() -> None:
    import uvicorn

    uvicorn.run(
        app,
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "8104")),
    )


if __name__ == "__main__":
    run()
