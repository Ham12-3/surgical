"""
Check that each asset's Blender MCP payload would pass the MCP's safe mode:

    python blender/scripts/safe_check.py [<id> ...]

Headless builds (build.py) run the scripts with full Python, so a script can
build fine there and still be rejected when it is sent through the MCP. This
puts together exactly what would be sent (the kit, the kits the script names,
the script and the build_and_export call) and asks blender-mcp's own
validator about it. It runs with any Python 3.10 or later, outside Blender.
With no ids, every script in blender/scripts/assets/ is checked.

The validator is blender_mcp/safe_mode.py from the blender-mcp package, which
uvx keeps in uv's cache; the newest copy there is used. Set
BLENDER_MCP_SAFE_MODE_PY to the path of another copy to use that instead.
"""

import importlib.util
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True  # no __pycache__ left in the repo
from build import OUT_DIR, asset_source  # noqa: E402 - found through the path set just above

# Where the package sits inside one of uv's unpacked environments, on Windows
# and on other systems.
PACKAGE_PATTERNS = (
    "archive-v0/*/Lib/site-packages/blender_mcp/safe_mode.py",
    "archive-v0/*/lib/python*/site-packages/blender_mcp/safe_mode.py",
    "archive-v0/*/blender_mcp/safe_mode.py",
)


def uv_cache():
    if os.environ.get("UV_CACHE_DIR"):
        return Path(os.environ["UV_CACHE_DIR"])
    if sys.platform == "win32":
        return Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local")) / "uv" / "cache"
    return Path.home() / ".cache" / "uv"


def find_validator():
    """The safe_mode.py to validate with, or None if blender-mcp was never run."""
    override = os.environ.get("BLENDER_MCP_SAFE_MODE_PY")
    if override:
        return Path(override)
    cache = uv_cache()
    found = [path for pattern in PACKAGE_PATTERNS for path in cache.glob(pattern)]
    return max(found, key=lambda path: path.stat().st_mtime) if found else None


def main():
    validator = find_validator()
    if validator is None or not validator.exists():
        sys.exit("blender-mcp's safe_mode.py was not found: run `uvx blender-mcp` once, or set BLENDER_MCP_SAFE_MODE_PY.")
    os.environ["BLENDER_MCP_SAFE_MODE"] = "1"
    spec = importlib.util.spec_from_file_location("blender_mcp_safe_mode", validator)
    safe_mode = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(safe_mode)

    ids = sys.argv[1:] or sorted(path.stem for path in (HERE / "assets").glob("*.py"))
    rejected = 0
    for asset_id in ids:
        source, _ = asset_source(asset_id)
        ok, message = safe_mode.is_safe(source + f'\nbuild_and_export("{asset_id}", r"{OUT_DIR}")\n')
        rejected += not ok
        print(f"{asset_id}: {'ok' if ok else 'rejected: ' + message}")
    print(f"checked with {validator}")
    sys.exit(1 if rejected else 0)


if __name__ == "__main__":
    main()
