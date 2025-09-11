"""Shared helpers for the Playwright test suite. See README.md for how to
run these tests and what needs to already be running.
"""
import random
import string

FRONTEND_URL = "http://localhost:4173"


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
