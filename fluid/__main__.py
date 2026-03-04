"""Allow running fluid as ``python -m fluid`` or ``python -m fluid --gui``."""

import sys

if __name__ == "__main__":
    if "--gui" in sys.argv:
        sys.argv.remove("--gui")
        from fluid.gui.server import run
        run()
    else:
        from fluid.cli import app
        app()
