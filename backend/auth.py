import os
import sys
from datetime import datetime, timedelta, timezone
import jwt
from pydantic import BaseModel, Field

# Passlib relies on the crypt module, which was removed in Python 3.13.
# We mock it to avoid ModuleNotFoundError on Python 3.13+.
try:
    import crypt
except ModuleNotFoundError:
    import types
    crypt = types.ModuleType("crypt")
    sys.modules["crypt"] = crypt

import bcrypt
# Patch bcrypt to have __about__.__version__ so passlib is happy
if not hasattr(bcrypt, "__about__"):
    class About:
        __version__ = getattr(bcrypt, "__version__", "4.0.0")
    bcrypt.__about__ = About()

# Patch bcrypt.hashpw to truncate to 72 bytes for passlib check compatibility
original_hashpw = bcrypt.hashpw
def patched_hashpw(password, salt):
    if isinstance(password, str):
        password_bytes = password.encode('utf-8')
    else:
        password_bytes = password
    if len(password_bytes) > 72:
        password_bytes = password_bytes[:72]
    return original_hashpw(password_bytes, salt)
bcrypt.hashpw = patched_hashpw

from passlib.context import CryptContext

# In production, this will be moved to a secure .env file
SECRET_KEY = os.environ.get("SECRET_KEY", "YOUR_SUPER_SECRET_ACADEMIC_KEY_CHANGE_ME")
ALGORITHM = "HS256"

# Configure Passlib to use bcrypt for password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Direct alias to pwd_context.verify
verify = pwd_context.verify

def hash_password(password: str) -> str:
    """Transforms a plain-text password into a secure, one-way cryptographic hash."""
    return pwd_context.hash(password)

# Alias for backward compatibility with router
get_password_hash = hash_password

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Compares a plain-text password against a stored database hash to verify identity."""
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        return False

def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
    """Generates an encrypted, signed JWT token for secure stateless user sessions."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=30))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def verify_access_token(token: str) -> dict | None:
    """Decodes and validates a JWT token, returning its payload if valid."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except (jwt.PyJWTError, KeyError):
        return None

# Pydantic Schemas for validation and serialization
class UserRegister(BaseModel):
    email: str = Field(..., pattern=r"^\S+@\S+\.\S+$", description="Simple email pattern validation")
    password: str = Field(..., min_length=6)

class UserLogin(BaseModel):
    email: str = Field(..., pattern=r"^\S+@\S+\.\S+$")
    password: str

class UserResponse(BaseModel):
    id: int
    email: str

    model_config = {
        "from_attributes": True
    }

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
