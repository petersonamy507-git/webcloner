"""Admin commands. Run from backend/:  python3 -m app.cli create-superadmin you@example.com"""
import getpass
import sys

from sqlalchemy import select

from app.auth import MIN_PASSWORD_LENGTH, hash_password
from app.bootstrap import bootstrap
from app.db import SessionLocal, User


def create_superadmin(email: str) -> None:
    email = email.strip().lower()
    password = getpass.getpass("Password: ")
    if len(password) < MIN_PASSWORD_LENGTH:
        sys.exit(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.")
    if password != getpass.getpass("Repeat password: "):
        sys.exit("Passwords do not match.")
    bootstrap()
    with SessionLocal() as db:
        user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
        if user:
            user.role, user.entity_id, user.is_active = "super_admin", None, True
            user.password_hash = hash_password(password)
        else:
            db.add(User(email=email, name="Super Admin", password_hash=hash_password(password),
                        role="super_admin", entity_id=None, is_active=True))
        db.commit()
    print(f"Super admin ready: {email}")


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "create-superadmin":
        create_superadmin(sys.argv[2])
    else:
        sys.exit("Usage: python3 -m app.cli create-superadmin <email>")
