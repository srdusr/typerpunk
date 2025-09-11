#!/usr/bin/env python3
"""Runs every test_*.py file in this directory and reports pass/fail. See
README.md for prerequisites (both servers must already be running).
"""
import glob
import importlib
import os
import sys
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def main():
    test_dir = os.path.dirname(os.path.abspath(__file__))
    files = sorted(glob.glob(os.path.join(test_dir, "test_*.py")))
    if not files:
        print("No test_*.py files found.")
        return 1

    failures = []
    for path in files:
        name = os.path.splitext(os.path.basename(path))[0]
        module = importlib.import_module(name)
        try:
            module.run()
        except Exception:
            failures.append(name)
            print(f"{name}: FAIL")
            traceback.print_exc()

    total = len(files)
    passed = total - len(failures)
    print(f"\n{passed}/{total} passed")
    if failures:
        print("Failed: " + ", ".join(failures))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
