#!/usr/bin/env python3
import argparse
import os
import shlex
import shutil
import subprocess
import sys
from pathlib import Path

# Add scripts to sys.path to import boards
sys.path.append(os.path.join(os.path.dirname(__file__), "scripts"))
from boards import SUPPORTED_BOARDS

BOARDS = list(SUPPORTED_BOARDS.keys())

STEPS = ["webapp", "splash", "firmware"]
PINNED_IDF_VERSION = "v6.0.2"
DEFAULT_IDF_PATH = os.path.expanduser(
    f"~/.espressif/frameworks/esp-idf-{PINNED_IDF_VERSION}"
)


def run_idf(args):
    """Run idf.py from the project's pinned ESP-IDF installation."""
    idf_path = os.environ.get("EINKWIND_IDF_PATH", DEFAULT_IDF_PATH)
    export_script = os.path.join(idf_path, "export.sh")

    if os.path.isfile(export_script):
        environment = os.environ.copy()
        if not environment.get("IDF_PYTHON_ENV_PATH"):
            env_root = Path.home() / ".espressif" / "python_env"
            candidates = sorted(env_root.glob("idf6.0_py*_env"), reverse=True)
            for candidate in candidates:
                if candidate.joinpath("bin", "python").is_file():
                    environment["IDF_PYTHON_ENV_PATH"] = str(candidate)
                    break
        command = (
            f"source {shlex.quote(export_script)} >/dev/null && "
            f"exec idf.py {shlex.join(args)}"
        )
        # Keep the caller's PATH. A login shell may replace it and make tools
        # such as CMake disappear even though ESP-IDF was launched from a
        # correctly configured development environment.
        return subprocess.run(["/bin/zsh", "-c", command], check=True, env=environment)

    if shutil.which("idf.py"):
        return subprocess.run(["idf.py", *args], check=True)

    raise FileNotFoundError(
        f"ESP-IDF {PINNED_IDF_VERSION} is not installed at {idf_path}. "
        "Install it there or set EINKWIND_IDF_PATH."
    )


def build_webapp():
    """Build the webapp (npm install + npm run build)."""
    print("\n=== Building webapp ===")
    try:
        subprocess.run("npm install", shell=True, check=True, cwd="webapp")
        subprocess.run("npm run build", shell=True, check=True, cwd="webapp")
    except subprocess.CalledProcessError as e:
        print(f"  ✗ Webapp build failed with exit code {e.returncode}")
        sys.exit(e.returncode)
    except FileNotFoundError:
        print(
            "  ✗ 'npm' not found. Please ensure Node.js is installed and in your PATH."
        )
        sys.exit(1)


def generate_splash(board):
    """Generate splash screen EPDGZ for the target board."""
    print(f"\n=== Generating splash screen for {board} ===", flush=True)
    output_dir = os.path.join(os.path.dirname(__file__), "main", "splash_data")
    script = os.path.join(os.path.dirname(__file__), "scripts", "generate_splash.py")
    process_cli_dir = os.path.join(os.path.dirname(__file__), "process-cli")

    # Ensure process-cli dependencies are installed
    node_modules = os.path.join(process_cli_dir, "node_modules")
    if not os.path.isdir(node_modules):
        print("  Installing process-cli dependencies...")
        try:
            subprocess.run("npm ci", shell=True, check=True, cwd=process_cli_dir)
        except subprocess.CalledProcessError as e:
            print(f"  ✗ npm ci failed in process-cli with exit code {e.returncode}")
            sys.exit(e.returncode)

    try:
        subprocess.run(
            [sys.executable, script, "--board", board, "--output-dir", output_dir],
            check=True,
        )
    except subprocess.CalledProcessError as e:
        print(f"  ✗ Splash generation failed with exit code {e.returncode}")
        sys.exit(e.returncode)


def build_firmware(board, extra_args, debug=False):
    """Build firmware with idf.py."""
    print(f"\n=== Building firmware for {board}{' [debug]' if debug else ''} ===")
    sdkconfig_defaults = f"sdkconfig.defaults;boards/sdkconfig.defaults.{board}"
    if debug:
        # Debug-only overlay: core-dump-to-flash capture (+ the coredump partition
        # from generate_partitions.py). Changes the partition table — never used
        # for release or demo builds.
        sdkconfig_defaults += ";sdkconfig.defaults.debug"

    idf_base = [
        f"-DSDKCONFIG_DEFAULTS={sdkconfig_defaults}",
    ]

    cmake_defines = [a for a in extra_args if a.startswith("-D")]
    post_build_args = [a for a in extra_args if not a.startswith("-D")]

    build_cmd = idf_base + cmake_defines + ["build"]
    print(f"Running: {' '.join(build_cmd)}")

    try:
        run_idf(build_cmd)
    except subprocess.CalledProcessError as e:
        print(f"Build failed with exit code {e.returncode}")
        sys.exit(e.returncode)
    except FileNotFoundError:
        print(
            f"Error: ESP-IDF {PINNED_IDF_VERSION} was not found. {e}"
        )
        sys.exit(1)

    # Run post-build commands (flash, monitor, etc.)
    if post_build_args:
        post_cmd = idf_base + post_build_args
        print(f"Running: {' '.join(post_cmd)}")
        try:
            run_idf(post_cmd)
        except subprocess.CalledProcessError as e:
            print(f"Post-build command failed with exit code {e.returncode}")
            sys.exit(e.returncode)


def main():
    parser = argparse.ArgumentParser(description="Build firmware for different boards")
    parser.add_argument(
        "--board",
        choices=BOARDS,
        default="waveshare_photopainter_73",
        help="Board type to build",
    )
    parser.add_argument(
        "--fullclean",
        action="store_true",
        help="Remove sdkconfig and run idf.py fullclean before building",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Debug build: enable core-dump-to-flash capture. Changes the "
        "partition table (adds a coredump partition) — do not ship to users.",
    )
    parser.add_argument(
        "--installer-output",
        type=Path,
        help="After the firmware build, write a validated browser-installer bundle here.",
    )
    parser.add_argument(
        "--installer-version",
        help="Immutable version used by --installer-output.",
    )
    parser.add_argument(
        "--step",
        choices=STEPS,
        action="append",
        help="Run only specific step(s). Can be specified multiple times. "
        "If omitted, all steps run.",
    )
    # Allow passing extra arguments to idf.py
    args, extra_args = parser.parse_known_args()

    steps = args.step if args.step else STEPS

    if args.fullclean:
        print("Performing full clean...")
        import shutil

        for f in ["sdkconfig", "partitions.csv"]:
            if os.path.exists(f):
                os.remove(f)
                print(f"  ✓ Removed {f}")
        if os.path.isdir("build"):
            shutil.rmtree("build")
            print("  ✓ Removed build/")

    if "webapp" in steps:
        build_webapp()

    if "splash" in steps:
        generate_splash(args.board)

    if "firmware" in steps:
        build_firmware(args.board, extra_args, debug=args.debug)
        if args.installer_output:
            if not args.installer_version:
                parser.error("--installer-output requires --installer-version")
            if args.board != "seeedstudio_reterminal_e1002" or args.debug:
                parser.error("installer bundles are release-only and currently support E1002")
            subprocess.run(
                [
                    sys.executable,
                    "scripts/generate_installer_manifest.py",
                    "--build-dir",
                    "build",
                    "--partitions",
                    "partitions.csv",
                    "--output",
                    str(args.installer_output),
                    "--version",
                    args.installer_version,
                ],
                check=True,
            )


if __name__ == "__main__":
    main()
