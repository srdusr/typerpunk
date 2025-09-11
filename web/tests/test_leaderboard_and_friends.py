"""Leaderboard mode/device filtering, and the friends request -> accept
flow between two real accounts. See README.md to run.
"""
from playwright.sync_api import sync_playwright
from helpers import FRONTEND_URL, random_username, register_and_login


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            page_a = browser.new_page(viewport={"width": 1280, "height": 900})
            page_b = browser.new_page(viewport={"width": 1280, "height": 900})

            user_a = random_username("friend_a")
            user_b = random_username("friend_b")
            register_and_login(page_a, user_a)
            register_and_login(page_b, user_b)

            # Leaderboard: mode picker and device filter both render and
            # don't error, even with no results yet for a fresh mode.
            page_a.click('[data-action="leaderboard"]')
            page_a.wait_for_selector(".leaderboard-modes", timeout=10000)
            page_a.click('[data-action="toggle-device-filter"]')
            page_a.wait_for_timeout(400)
            # Case-insensitive: this button's text may render uppercase via
            # CSS text-transform, which inner_text() reflects.
            assert "desktop only" in page_a.locator('[data-action="toggle-device-filter"]').inner_text().lower()
            assert page_a.locator(".stats-empty, .leaderboard-row").count() > 0, "leaderboard body did not render"
            page_a.click('[data-action="menu"]')
            page_a.wait_for_timeout(300)

            # Friends: A sends a request to B, B accepts, both sides settle
            # into the Friends list.
            page_a.click('[data-action="rail-friends"]')
            page_a.wait_for_selector(".friends-add-form", timeout=10000)
            page_a.fill('.friends-add-form input[name="username"]', user_b)
            page_a.click('.friends-add-form button[type="submit"]')
            page_a.wait_for_timeout(600)

            page_b.click('[data-action="rail-friends"]')
            page_b.wait_for_selector('[data-action="accept"]', timeout=10000)
            page_b.click('[data-action="accept"]')
            page_b.wait_for_timeout(600)

            assert page_b.locator(".leaderboard-row", has_text=user_a).count() > 0, "B does not see A as a friend"

            page_a.reload()
            page_a.wait_for_timeout(500)
            page_a.click('[data-action="rail-friends"]')
            page_a.wait_for_timeout(600)
            assert page_a.locator(".leaderboard-row", has_text=user_b).count() > 0, "A does not see B as a friend"

            print("test_leaderboard_and_friends: PASS")
        finally:
            browser.close()


if __name__ == "__main__":
    run()
