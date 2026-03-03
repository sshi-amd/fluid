"""TUI dashboard and Rich display components for fluid."""

from __future__ import annotations

import sys
import time
from typing import Optional

from rich.columns import Columns
from rich.console import Console
from rich.layout import Layout
from rich.live import Live
from rich.panel import Panel
from rich.prompt import Prompt
from rich.table import Table
from rich.text import Text

from fluid.config import (
    CONTAINER_PREFIX,
    LABEL_ROCM_VERSION,
    ContainerRecord,
    State,
    load_state,
)

console = Console()

STATUS_COLORS = {
    "running": "green",
    "exited": "red",
    "created": "yellow",
    "paused": "yellow",
    "restarting": "cyan",
    "dead": "red",
}


def _status_badge(status: str) -> str:
    color = STATUS_COLORS.get(status, "dim")
    return f"[{color}]⬤ {status}[/{color}]"


def _container_card(container, is_current: bool) -> Panel:
    version = container.labels.get(LABEL_ROCM_VERSION, "?")
    name = container.name.removeprefix(f"{CONTAINER_PREFIX}-")
    status = container.status
    image = container.image.tags[0] if container.image.tags else "—"

    lines = [
        f"[bold]ROCm {version}[/bold]",
        "",
        f"  Status  {_status_badge(status)}",
        f"  Image   [dim]{image}[/dim]",
        f"  ID      [dim]{container.short_id}[/dim]",
    ]

    border_style = "green bold" if is_current else "dim"
    title_suffix = " [green]● active[/green]" if is_current else ""

    return Panel(
        "\n".join(lines),
        title=f"[bold]{name}[/bold]{title_suffix}",
        border_style=border_style,
        width=40,
        padding=(1, 2),
    )


def print_status_panel(state: State, containers: list) -> None:
    if not containers:
        console.print(
            Panel(
                "[dim]No containers managed by fluid.\n"
                "Run [bold]fluid create -v <version>[/bold] to get started.[/dim]",
                title="[bold cyan]fluid status[/bold cyan]",
                border_style="dim",
                padding=(1, 2),
            )
        )
        return

    current_panel = None
    other_panels = []

    for c in sorted(containers, key=lambda x: x.name):
        is_current = state.current == c.name
        card = _container_card(c, is_current)
        if is_current:
            current_panel = card
        else:
            other_panels.append(card)

    console.print()

    if current_panel:
        console.print(
            Panel(
                current_panel,
                title="[bold green]Current Container[/bold green]",
                border_style="green",
                padding=(0, 1),
            )
        )
        console.print()

    if other_panels:
        console.print("[bold]Other Containers:[/bold]")
        console.print(Columns(other_panels, padding=(1, 1)))
        console.print()

    running = sum(1 for c in containers if c.status == "running")
    total = len(containers)
    console.print(
        f"[dim]{running} running / {total} total[/dim]"
    )
    console.print()


def _build_dashboard_layout(state: State, containers: list) -> Layout:
    layout = Layout()
    layout.split_column(
        Layout(name="header", size=3),
        Layout(name="body"),
        Layout(name="footer", size=3),
    )

    header_text = Text(" fluid dashboard", style="bold white on blue")
    header_text.append("  ", style="")
    header_text.append(
        f"  {len(containers)} containers", style="bold white on blue"
    )
    layout["header"].update(Panel(header_text, style="blue"))

    body_content = _build_container_table(state, containers)
    layout["body"].update(
        Panel(
            body_content,
            title="[bold]Containers[/bold]",
            border_style="cyan",
            padding=(1, 2),
        )
    )

    footer_text = Text(
        " [q] Quit  [c] Create  [e] Enter  [k] Kill  [r] Refresh",
        style="bold white on dark_green",
    )
    layout["footer"].update(Panel(footer_text, style="dark_green"))

    return layout


def _build_container_table(state: State, containers: list) -> Table:
    table = Table(
        border_style="dim",
        show_lines=True,
        expand=True,
        row_styles=["", "dim"],
    )
    table.add_column("#", style="dim", width=3, justify="right")
    table.add_column("Name", style="bold", ratio=2)
    table.add_column("ROCm", style="magenta bold", justify="center", width=10)
    table.add_column("Status", justify="center", width=14)
    table.add_column("Active", justify="center", width=8)
    table.add_column("Image", style="dim", ratio=2)

    if not containers:
        table.add_row("", "[dim]No containers[/dim]", "", "", "", "")
        return table

    for i, c in enumerate(sorted(containers, key=lambda x: x.name), 1):
        version = c.labels.get(LABEL_ROCM_VERSION, "?")
        is_current = state.current == c.name
        name = c.name.removeprefix(f"{CONTAINER_PREFIX}-")
        image = c.image.tags[0] if c.image.tags else str(c.image.id)[:12]

        table.add_row(
            str(i),
            name,
            version,
            _status_badge(c.status),
            "[green bold]●[/green bold]" if is_current else "[dim]○[/dim]",
            image,
        )

    return table


def run_dashboard() -> None:
    """Interactive dashboard with live refresh."""
    from fluid.docker_manager import (
        create_container,
        enter_container,
        get_client,
        kill_container,
        list_managed_containers,
    )

    client = get_client()

    console.clear()
    console.print("[bold cyan]fluid dashboard[/bold cyan]")
    console.print("[dim]Loading...[/dim]")

    try:
        while True:
            console.clear()
            state = load_state()
            containers = list_managed_containers(client)
            layout = _build_dashboard_layout(state, containers)
            console.print(layout)
            console.print()

            action = Prompt.ask(
                "[bold]Action[/bold]",
                choices=["q", "c", "e", "k", "r", "s"],
                default="r",
            )

            if action == "q":
                console.print("[dim]Goodbye![/dim]")
                break
            elif action == "c":
                version = Prompt.ask("ROCm version", default="6.3")
                name = Prompt.ask("Container name (empty for auto)", default="")
                create_container(
                    rocm_version=version,
                    name=name or None,
                )
                Prompt.ask("[dim]Press Enter to continue[/dim]", default="")
            elif action == "e":
                name = Prompt.ask("Container name to enter")
                if name:
                    enter_container(name)
            elif action == "k":
                name = Prompt.ask("Container name to kill (empty for current)", default="")
                kill_container(name or None)
                Prompt.ask("[dim]Press Enter to continue[/dim]", default="")
            elif action == "s":
                print_status_panel(state, containers)
                Prompt.ask("[dim]Press Enter to continue[/dim]", default="")
            elif action == "r":
                continue

    except KeyboardInterrupt:
        console.print("\n[dim]Exited.[/dim]")
