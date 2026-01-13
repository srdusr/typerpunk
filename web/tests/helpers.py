"""Shared helpers for the Playwright test suite. See README.md for how to
run these tests and what needs to already be running.
"""
import os
import random
import string
import subprocess

FRONTEND_URL = "http://localhost:4173"

# Buying is a real payment now, so a test cannot get an item by clicking Buy.
# Ownership is granted straight in the database instead, which is what a paid
# webhook would have done.
DATABASE_URL = os.environ.get(
    "TYPERPUNK_TEST_DATABASE_URL",
    "postgresql://typerpunk:typerpunk@localhost/typerpunk",
)


def grant_cosmetics(username, cosmetic_ids):
    """Gives an account the named cosmetics without going through checkout."""
    ids = ", ".join(f"'{cid}'" for cid in cosmetic_ids)
    sql = (
        "INSERT INTO user_cosmetics (user_id, cosmetic_id, acquired_at) "
        "SELECT u.id, c.id, '2026-01-01T00:00:00Z' "
        "FROM users u CROSS JOIN cosmetics c "
        f"WHERE u.username = '{username}' AND c.id IN ({ids}) "
        "ON CONFLICT (user_id, cosmetic_id) DO NOTHING"
    )
    subprocess.run(
        ["psql", DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-c", sql],
        check=True, capture_output=True,
    )


def random_username(prefix="test"):
    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"{prefix}_{suffix}"


def random_password():
    """A fresh password per run. These accounts are throwaway, so nothing is
    gained by a fixed literal - and a hardcoded one in a checked-in file has
    the shape of a real credential, which trips secret scanners."""
    return "Tp" + "".join(random.choices(string.ascii_letters + string.digits, k=16))


def register_and_login(page, username, password=None):
    """Registers a fresh account through the real Account screen and leaves
    the app on the main menu, signed in."""
    password = password or random_password()
    page.goto(FRONTEND_URL, timeout=40000)
    # The account entry point is the top-right identity control: "Sign In"
    # when signed out, your username once signed in. It used to be an icon in
    # the main menu's bottom-left cluster.
    page.click('.auth-control button')
    page.wait_for_timeout(300)
    page.click('[data-action="tab-register"]')
    page.fill('input[name="username"]', username)
    page.fill('input[name="password"]', password)
    page.click('.account-form button[type="submit"]')
    page.wait_for_selector('.account-signed-in', timeout=10000)
    page.click('[data-action="menu"]')
    page.wait_for_timeout(300)
