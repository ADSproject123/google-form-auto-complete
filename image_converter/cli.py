"""Command-line interface for the image conversion utility."""

import argparse
import json
import shutil
import sys
from pathlib import Path
from typing import List, Optional

from PIL import Image, features

from image_converter.converter import convert_image, convert_images
from image_converter.exceptions import ImageConverterError
from image_converter.formats import FORMAT_REGISTRY, normalize_format


def check_system_dependencies() -> dict:
    pillow_ver = getattr(Image, "__version__", "unknown")
    magick_path = shutil.which("magick") or shutil.which("convert")
    gs_path = shutil.which("gs")
    potrace_path = shutil.which("potrace")

    avif_support = features.check("avif")
    webp_support = features.check("webp")
    jp2_support = features.check("jpg_2000")

    return {
        "pillow": {
            "installed": True,
            "version": pillow_ver,
            "webp_support": webp_support,
            "avif_support": avif_support,
            "jpeg2000_support": jp2_support,
        },
        "imagemagick": {
            "installed": magick_path is not None,
            "path": magick_path,
        },
        "ghostscript": {
            "installed": gs_path is not None,
            "path": gs_path,
        },
        "potrace": {
            "installed": potrace_path is not None,
            "path": potrace_path,
        },
    }


def print_dependencies_report(deps: dict) -> None:
    print("=" * 60)
    print("Image Converter Dependency & Environment Status")
    print("=" * 60)
    pil = deps["pillow"]
    print(f"Pillow (PIL):      Installed (v{pil['version']})")
    print(f"  - WebP:          {'✓ Enabled' if pil['webp_support'] else '✗ Missing'}")
    print(f"  - AVIF:          {'✓ Enabled' if pil['avif_support'] else '✗ Missing'}")
    print(f"  - JPEG 2000:     {'✓ Enabled' if pil['jpeg2000_support'] else '✗ Missing'}")

    im = deps["imagemagick"]
    if im["installed"]:
        print(f"ImageMagick:       ✓ Installed ({im['path']})")
    else:
        print("ImageMagick:       ✗ Not installed (optional for PSD, HDR, EXR, etc.)")

    gs = deps["ghostscript"]
    if gs["installed"]:
        print(f"Ghostscript:       ✓ Installed ({gs['path']})")
    else:
        print("Ghostscript:       ✗ Not installed")

    potrace = deps["potrace"]
    if potrace["installed"]:
        print(f"Potrace (vector):  ✓ Installed ({potrace['path']})")
    else:
        print("Potrace (vector):  ✗ Not installed (raster-to-SVG uses base64 embedding)")
    print("=" * 60)


def print_format_list() -> None:
    deps = check_system_dependencies()
    has_im = deps["imagemagick"]["installed"]

    print("=" * 75)
    print(f"{'FORMAT':<10} {'BACKEND':<14} {'EXTENSIONS':<25} {'ALPHA':<7} {'STATUS'}")
    print("=" * 75)

    for name, info in sorted(FORMAT_REGISTRY.items()):
        exts = ", ".join(info.extensions)
        alpha = "Yes" if info.supports_alpha else "No"

        if info.backend == "pillow" or info.backend == "svg":
            status = "✓ Ready"
        elif info.backend == "imagemagick":
            status = "✓ Ready" if has_im else f"Requires {info.delegate_needed or 'ImageMagick'}"
        else:
            status = "Available"

        print(f"{name:<10} {info.backend:<14} {exts:<25} {alpha:<7} {status}")
    print("=" * 75)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="image-converter",
        description="Production-ready multi-format image converter supporting 70+ formats.",
    )
    parser.add_argument("inputs", nargs="*", help="Input image file path(s).")
    parser.add_argument("-f", "--format", dest="target_format", help="Target output format.")
    parser.add_argument("-o", "--output", dest="output_path", help="Target output file path.")
    parser.add_argument("-d", "--output-dir", dest="output_directory", help="Directory to write output file(s).")
    parser.add_argument("-q", "--quality", type=int, help="Image quality (1-100).")
    parser.add_argument("--lossless", action="store_true", help="Enable lossless compression.")
    parser.add_argument("--optimize", action="store_true", help="Optimize output encoding.")
    parser.add_argument("--progressive", action="store_true", help="Save progressive JPEG.")
    parser.add_argument("--background", default="white", help="Background color for flattening transparency.")
    parser.add_argument("--vectorize", action="store_true", help="Vectorize contours when converting to SVG.")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing output files.")
    parser.add_argument("--no-animation", action="store_true", help="Disable animation preservation.")
    parser.add_argument("--no-metadata", action="store_true", help="Disable metadata preservation.")
    parser.add_argument("--list-formats", action="store_true", help="List all supported formats.")
    parser.add_argument("--check-dependencies", action="store_true", help="Check installed dependencies.")
    parser.add_argument("--json", action="store_true", help="Output results in JSON format.")
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.check_dependencies:
        deps = check_system_dependencies()
        if args.json:
            print(json.dumps(deps, indent=2))
        else:
            print_dependencies_report(deps)
        return 0

    if args.list_formats:
        print_format_list()
        return 0

    if not args.inputs:
        parser.print_help()
        print("\nError: Please specify one or more input images.", file=sys.stderr)
        return 1

    if not args.target_format:
        print("Error: Target format must be specified via -f / --format.", file=sys.stderr)
        return 1

    bg = args.background
    if "," in bg:
        parts = [int(p.strip()) for p in bg.split(",")]
        bg = tuple(parts)

    options = {
        "overwrite": args.overwrite,
        "preserve_animation": not args.no_animation,
        "preserve_metadata": not args.no_metadata,
        "background": bg,
        "vectorize": args.vectorize,
    }
    if args.quality is not None:
        options["quality"] = args.quality
    if args.lossless:
        options["lossless"] = True
    if args.optimize:
        options["optimize"] = True
    if args.progressive:
        options["progressive"] = True

    try:
        if len(args.inputs) == 1 and not args.output_directory:
            inp = args.inputs[0]
            result = convert_image(
                input_path=inp,
                output_format=args.target_format,
                output_path=args.output_path,
                **options,
            )
            if args.json:
                print(json.dumps(result.to_dict(), indent=2))
            else:
                print(f"✓ Converted '{result.input_path}' -> '{result.output_path}'")
                print(f"  Format: {result.input_format} -> {result.output_format} ({result.backend_used})")
                print(f"  Dimensions: {result.dimensions[0]}x{result.dimensions[1]}")
                print(f"  File size: {result.file_size_bytes} bytes ({result.duration_ms} ms)")
                if result.warnings:
                    for w in result.warnings:
                        print(f"  Note: {w}")
            return 0

        batch_res = convert_images(
            input_paths=args.inputs,
            output_format=args.target_format,
            output_directory=args.output_directory,
            **options,
        )

        if args.json:
            print(json.dumps(batch_res.to_dict(), indent=2))
        else:
            print(f"Batch conversion completed:")
            print(f"  Total: {batch_res.total}")
            print(f"  Succeeded: {batch_res.succeeded}")
            print(f"  Failed: {batch_res.failed}")
            for res in batch_res.results:
                print(f"  ✓ {res.input_path} -> {res.output_path}")
            for err in batch_res.errors:
                print(f"  ✗ {err['input_path']}: [{err['error_type']}] {err['error_message']}", file=sys.stderr)

        return 0 if batch_res.failed == 0 else 1

    except ImageConverterError as e:
        if args.json:
            print(json.dumps({"error": type(e).__name__, "message": str(e)}, indent=2))
        else:
            print(f"Error [{type(e).__name__}]: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        if args.json:
            print(json.dumps({"error": "UnexpectedError", "message": str(e)}, indent=2))
        else:
            print(f"Unexpected error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())

