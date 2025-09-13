"""Core golden path: main menu loads, a typing test can be started, typed
characters show correct/incorrect feedback and live stats, and finishing
reaches the end screen with a results graph. See README.md to run.
"""
from playwright.sync_api import sync_playwright
from helpers import FRONTEND_URL


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            page = browser.new_page(viewport={"width": 1280, "height": 900})
            page.goto(FRONTEND_URL, timeout=40000)

            assert page.locator(".main-menu").is_visible(), "main menu did not render"
            # inner_text() reflects CSS text-transform (this heading may be
            # rendered uppercase) - compare case-insensitively rather than
            # asserting on the exact source casing.
            assert "typerpunk" in page.locator(".main-menu h1").inner_text().lower()

            # Single Player opens the mode picker; choosing a mode starts the
            # test. It used to start the last-used mode on one click.
            page.click('[data-action="pick-mode"]')
            page.wait_for_selector('.sp-popover .mode-popover-item[data-mode="quotes"]', timeout=10000)
            page.click('.sp-popover .mode-popover-item[data-mode="quotes"]')
            page.wait_for_selector(".typing-game", timeout=10000)

            input_el = page.locator(".typing-input")
            input_el.click()
            page.keyboard.type("abcdefghij", delay=30)
            page.wait_for_timeout(300)

            wpm_text = page.locator('[data-field="wpm"]').inner_text()
            assert wpm_text.strip() != "", "live WPM stat did not render"

            classes = page.locator(".text-display span[class]").first.get_attribute("class")
            assert classes is not None, "typed characters have no highlight class"

            # Finish the test by typing enough characters to exhaust the
            # visible text sample - Tab is the quick-restart shortcut, not
            # a way to finish, so this has to actually type to completion.
            text_len = len(page.locator(".text-display").inner_text().replace("\n", " "))
            remaining = max(0, text_len - 10)
            if remaining > 0:
                page.keyboard.type("a" * remaining, delay=1)

            page.wait_for_selector(".end-screen", timeout=15000)
            assert page.locator(".end-screen-graph-row canvas").is_visible(), "results graph did not render"
            assert page.locator(".end-screen .stat-value").first.is_visible(), "end screen stats missing"

            print("test_typing_flow: PASS")
        finally:
            browser.close()


if __name__ == "__main__":
    run()
