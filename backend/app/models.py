from typing import Any, Optional
from urllib.parse import urlparse

from pydantic import BaseModel, Field, field_validator


class CloneRequest(BaseModel):
    url: str
    folderName: Optional[str] = None
    mode: str = "full"
    # Cookies from the user's own signed-in browser, for pages behind a login.
    # Used for this clone only; never stored or logged.
    sessionCookies: Optional[str] = Field(default=None, max_length=20000, repr=False)

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        value = (value or "").strip()
        parsed = urlparse(value)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise ValueError("URL must start with http:// or https://")
        return value


class ApplyBrandRequest(BaseModel):
    folder: str
    brand: str


class UseBrandImageRequest(BaseModel):
    folder: str
    brand: str
    file: str


class ReplaceLogosRequest(BaseModel):
    folder: str
    logoPath: str
    oldSrc: Optional[str] = ""


class SaveRequest(BaseModel):
    folder: str
    page: str = "index.html"
    html: str


class UploadRequest(BaseModel):
    folder: str
    data: str
    ext: str = "png"


class CreatePageRequest(BaseModel):
    folder: str
    pageName: str
    template: str = "shell"
    title: Optional[str] = None
    description: Optional[str] = None


class ThemePostRequest(BaseModel):
    folder: str
    theme: Optional[dict[str, Any]] = None


class GeneratePageRequest(BaseModel):
    folder: str
    pageName: str
    pageTitle: Optional[str] = None
    prompt: str
    description: Optional[str] = None
    linkPlacement: Optional[str] = None


class FixWithAiRequest(BaseModel):
    folder: str
    page: str = "index.html"
    prompt: str
    imageSrc: Optional[str] = None


class AiCustomizeRequest(BaseModel):
    folder: str
    prompt: str
    logoUrl: Optional[str] = None
    logoBase64: Optional[str] = None


class PhpRestructureRequest(BaseModel):
    folder: str


class HeadSnippetsRequest(BaseModel):
    folder: str
    snippet: Optional[str] = None


class HistoryRequest(BaseModel):
    folder: str
    action: str = "snapshot"
    id: Optional[str] = ""
    label: Optional[str] = ""


class AiAuditRequest(BaseModel):
    folder: str
    mode: str = "fix"
    categories: list[str] = Field(default_factory=lambda: ["all"])
    prompt: Optional[str] = None
    direct: bool = True
    useAI: bool = True


class AiFixSelectionRequest(BaseModel):
    folder: str
    page: str = "index.html"
    selection: dict[str, Any] = Field(default_factory=dict)
    prompt: Optional[str] = None
    useAI: bool = True


class AiEditRequest(BaseModel):
    folder: str
    page: str = "index.html"
    prompt: str = ""
    images: list[str] = Field(default_factory=list)
    selection: Optional[dict[str, Any]] = None
    insert: Optional[str] = None  # "before" | "after" | "end": add a new section instead of editing


class AiEditSelectionRequest(BaseModel):
    folder: str
    page: str = "index.html"
    selection: dict[str, Any] = Field(default_factory=dict)
    prompt: str = ""
    mediaBase64: Optional[str] = None
    mediaExt: Optional[str] = None
