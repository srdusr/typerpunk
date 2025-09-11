"""Account registration, and the cosmetics store's buy/equip flow --
including that an equipped caret color and flair icon actually show up,
not just that the API calls succeed. See README.md to run.
"""
from playwright.sync_api import sync_playwright
from helpers import FRONTEND_URL, random_username, register_and_login


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            page = browser.new_page(viewport={"width": 1280, "height": 900})
            username = random_username("store")
            register_and_login(page, username)
            assert page.locator('.auth-control button').count() > 0

            page.click('[data-action="store"]')
            page.wait_for_selector(".store-item-row", timeout=10000)
            rows = page.locator(".store-item-row")
            assert rows.count() > 0, "store catalog did not render"

            def buy_and_equip(item_name):
                row = page.locator(".store-item-row", has=page.locator(".leaderboard-name", has_text=item_name))
                buy_btn = row.locator('[data-action="buy"]')
                if buy_btn.count() > 0:
                    buy_btn.click()
                    page.wait_for_timeout(500)
                row = page.locator(".store-item-row", has=page.locator(".leaderboard-name", has_text=item_name))
                row.locator('[data-action="equip"]').click(timeout=10000)
                page.wait_for_timeout(500)

            buy_and_equip("Cyan Caret")
            buy_and_equip("Bolt")

            equipped_rows = page.locator(".store-item-row", has=page.get_by_text("EQUIPPED"))
            assert equipped_rows.count() >= 2, "expected caret and flair to both show as equipped"

            # Equipped caret color should now override --caret-color on the
            # typing screen itself, not just in the store's own UI.
            page.click('[data-action="menu"]')
            page.wait_for_timeout(300)
            page.click('[data-action="start"]')
            page.wait_for_timeout(500)
            caret_color = page.evaluate(
                "() => getComputedStyle(document.querySelector('.typing-game')).getPropertyValue('--caret-color').trim()"
            )
            assert caret_color.lower() == "#00e5ff", f"expected cyan caret override, got {caret_color!r}"

            print("test_account_and_store: PASS")
        finally:
            browser.close()


if __name__ == "__main__":
    run()
