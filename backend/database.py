import sqlite3
import os
from contextlib import contextmanager

# Dynamic database path relative to backend folder
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_FILE = os.path.join(BASE_DIR, "timetable.db")

def init_db():
    """
    Initializes the SQLite database and creates the users table if it doesn't exist.
    """
    conn = sqlite3.connect(DATABASE_FILE)
    try:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                hashed_password TEXT NOT NULL
            );
        """)
        conn.commit()
    finally:
        conn.close()

@contextmanager
def get_db():
    """
    Context manager for database connections. Yields a sqlite3.Connection with sqlite3.Row factory.
    Automatically commits changes and closes the connection.
    """
    conn = sqlite3.connect(DATABASE_FILE)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
