# Python Image Conversion Utility

A production-ready, security-hardened image conversion utility supporting 70+ image formats with layered backends (Pillow, ImageMagick, and SVG generator), integrated directly with the Next.js web application.

## Features
- **70+ Formats Supported**: Covers WebP, PNG, JPEG, SVG, ICO, BMP, TIFF, GIF, TGA, DDS, Netpbm, PCX, SGI, XBM, PALM, JP2, and more.
- **Layered Architecture**: Pillow (native fast raster), SVG generator (base64 embedding and optional vector tracing), and safe ImageMagick subprocess runner.
- **Next.js Full Integration**: Integrated API route (`/api/image-convert`) and web interface tab (`Image Converter`) with credit deduction and instant download.
- **Unit Tests**: Full Python test suite covering format handling, transparency compositing, animation preservation, and metadata.

