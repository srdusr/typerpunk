"""Account registration, and the cosmetics store's buy and equip flow.

Buying is a real payment now, so clicking Buy leaves for the processor rather
than granting anything. The test asserts that it does not grant, then gives
the account its items the way a paid webhook would, and checks that an
equipped caret colour and flair icon actually show up rather than that the
API calls returned 200. See README.md to run.
"""
from playwright.sync_api import sync_playwright
from helpers import FRONTEND_URL, grant_cosmetics, random_username, register_and_login


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            page = browser.new_page(viewport={"width": 1280, "height": 900})
            username = random_username("store")
            register_and_login(page, username)
            # Signed in, the identity control is the account's own avatar in
            # the icon row. The Sign In and Sign Up links below it are gone.
            assert page.locator('.rail-avatar').count() > 0, "no avatar after signing in"
            assert page.locator('.auth-control button').count() == 0, "sign-in links still shown while signed in"

            page.click('[data-action="store"]')
            page.wait_for_selector(".store-item-row", timeout=10000)
            rows = page.locator(".store-item-row")
            assert rows.count() > 0, "store catalog did not render"

            def row_for(item_name):
                return page.locator(
                    ".store-item-row",
                    has=page.locator(".leaderboard-name", has_text=item_name),
                )

            # Buy must not grant. Before this was a real payment the endpoint
            # handed the item over for nothing, so anyone signed in could take
            # the catalogue. Clicking Buy leaves for the processor, or reports
            # that payments are unconfigured; either way nothing is owned and
            # no Equip control appears.
            row_for("Cyan Caret").locator('[data-action="buy"]').click()
            page.wait_for_timeout(800)
            assert row_for("Cyan Caret").locator('[data-action="equip"]').count() == 0, \
                "Buy granted the item without a payment"

            # Granted the way a signature-verified webhook would.
            grant_cosmetics(username, ["caret-cyan", "flair-bolt"])
            # A reload drops back to the menu, so the store has to be reopened.
            page.reload()
            page.wait_for_timeout(600)
            page.click('[data-action="store"]')
            page.wait_for_selector(".store-item-row", timeout=10000)

            for item_name in ("Cyan Caret", "Bolt"):
                row_for(item_name).locator('[data-action="equip"]').click(timeout=10000)
                page.wait_for_timeout(500)

            equipped_rows = page.locator(".store-item-row", has=page.get_by_text("EQUIPPED"))
            assert equipped_rows.count() >= 2, "expected caret and flair to both show as equipped"

            # Equipped caret color should now override --caret-color on the
            # typing screen itself, not just in the store's own UI.
            page.click('[data-action="menu"]')
            page.wait_for_timeout(300)
            # Single Player opens the mode picker; choosing a mode starts the
            # test. It used to start the last-used mode on one click.
            page.click('[data-action="pick-mode"]')
            page.wait_for_selector('.sp-popover .mode-popover-item[data-mode="quotes"]', timeout=10000)
            page.click('.sp-popover .mode-popover-item[data-mode="quotes"]')
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
