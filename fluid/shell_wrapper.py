"""Generate the in-container shell wrapper script for fluid."""

# Exit code 0  = normal exit (keep container running)
# Exit code 42 = fluid exit (signal host to stop container)
WRAPPER_SCRIPT = r"""#!/bin/bash
# fluid - in-container wrapper (auto-generated, do not edit)

ROCM_VERSION="${ROCM_VERSION:-unknown}"
CONTAINER_NAME="$(hostname)"

case "${1:-}" in
    exit)
        echo -e "\033[36mfluid: exiting container and stopping...\033[0m"
        exit 42
        ;;
    info)
        echo ""
        echo "  Container:  $CONTAINER_NAME"
        echo "  ROCm:       $ROCM_VERSION"
        echo "  ROCm path:  $(readlink -f /opt/rocm 2>/dev/null || echo 'N/A')"
        if command -v rocm-smi &>/dev/null; then
            echo ""
            rocm-smi --showproductname 2>/dev/null | head -20
        fi
        echo ""
        ;;
    status)
        echo ""
        echo "  Container:  $CONTAINER_NAME"
        echo "  ROCm:       $ROCM_VERSION"
        echo "  User:       $(whoami)"
        echo "  Workspace:  /workspace"
        echo "  Uptime:     $(uptime -p 2>/dev/null || echo 'N/A')"
        echo ""
        ;;
    help|--help|-h)
        echo ""
        echo "fluid (in-container commands):"
        echo ""
        echo "  fluid exit     Exit the container and stop it"
        echo "  fluid info     Show container and ROCm info"
        echo "  fluid status   Show container status"
        echo "  fluid help     Show this help"
        echo ""
        echo "For full fluid commands (create, swap, kill, etc.),"
        echo "use fluid on the host machine."
        echo ""
        ;;
    "")
        echo ""
        echo "fluid (in-container commands):"
        echo ""
        echo "  fluid exit     Exit the container and stop it"
        echo "  fluid info     Show container and ROCm info"
        echo "  fluid status   Show container status"
        echo "  fluid help     Show this help"
        echo ""
        ;;
    *)
        echo "fluid: '$1' is only available on the host."
        echo "Run 'fluid help' for in-container commands."
        exit 1
        ;;
esac
"""

EXIT_CODE_STOP = 42


def get_wrapper_script() -> str:
    return WRAPPER_SCRIPT
