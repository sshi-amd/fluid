"""Async PTY bridge: connects a WebSocket to a docker exec PTY session."""

from __future__ import annotations

import asyncio
import fcntl
import os
import pty
import signal
import struct
import termios
from typing import Optional


class PtySession:
    """Manages a single PTY-backed docker exec process."""

    def __init__(self, container_name: str, command: str = "/bin/bash",
                 extra_env: Optional[dict[str, str]] = None) -> None:
        self.container_name = container_name
        self.command = command
        self.extra_env = extra_env or {}
        self._master_fd: Optional[int] = None
        self._pid: Optional[int] = None
        self._closed = False

    def spawn(self, cols: int = 120, rows: int = 30) -> int:
        """Fork a PTY running docker exec. Returns the master fd."""
        master, slave = pty.openpty()

        child_pid = os.fork()
        if child_pid == 0:
            os.close(master)
            os.setsid()
            fcntl.ioctl(slave, termios.TIOCSCTTY, 0)

            os.dup2(slave, 0)
            os.dup2(slave, 1)
            os.dup2(slave, 2)
            if slave > 2:
                os.close(slave)

            cmd = ["docker", "exec", "-it"]
            for key, val in self.extra_env.items():
                cmd.extend(["-e", f"{key}={val}"])
            cmd.extend([self.container_name, self.command])

            os.execvp("docker", cmd)
        else:
            os.close(slave)
            self._master_fd = master
            self._pid = child_pid
            self.resize(cols, rows)
            _set_nonblocking(master)
            return master

    def resize(self, cols: int, rows: int) -> None:
        if self._master_fd is not None:
            winsize = struct.pack("HHHH", rows, cols, 0, 0)
            try:
                fcntl.ioctl(self._master_fd, termios.TIOCSWINSZ, winsize)
            except OSError:
                pass

    def write(self, data: bytes) -> None:
        if self._master_fd is not None and not self._closed:
            try:
                os.write(self._master_fd, data)
            except OSError:
                pass

    async def read(self) -> bytes:
        if self._master_fd is None or self._closed:
            return b""
        loop = asyncio.get_event_loop()
        try:
            return await loop.run_in_executor(None, self._blocking_read)
        except OSError:
            return b""

    def _blocking_read(self) -> bytes:
        if self._master_fd is None:
            return b""
        try:
            return os.read(self._master_fd, 4096)
        except OSError:
            return b""

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        if self._master_fd is not None:
            try:
                os.close(self._master_fd)
            except OSError:
                pass
            self._master_fd = None
        if self._pid is not None:
            try:
                os.kill(self._pid, signal.SIGTERM)
            except (OSError, ProcessLookupError):
                pass
            try:
                os.waitpid(self._pid, os.WNOHANG)
            except ChildProcessError:
                pass
            self._pid = None

    @property
    def is_alive(self) -> bool:
        if self._pid is None or self._closed:
            return False
        try:
            pid, status = os.waitpid(self._pid, os.WNOHANG)
            return pid == 0
        except ChildProcessError:
            return False


class HostPtySession(PtySession):
    """PTY session running a local shell on the host machine (not in a container)."""

    def __init__(self, shell: Optional[str] = None) -> None:
        super().__init__(container_name="__host__", command=shell or "/bin/bash")

    def spawn(self, cols: int = 120, rows: int = 30) -> int:
        master, slave = pty.openpty()

        child_pid = os.fork()
        if child_pid == 0:
            os.close(master)
            os.setsid()
            fcntl.ioctl(slave, termios.TIOCSCTTY, 0)

            os.dup2(slave, 0)
            os.dup2(slave, 1)
            os.dup2(slave, 2)
            if slave > 2:
                os.close(slave)

            shell = self.command
            os.execvp(shell, [shell])
        else:
            os.close(slave)
            self._master_fd = master
            self._pid = child_pid
            self.resize(cols, rows)
            _set_nonblocking(master)
            return master


def _set_nonblocking(fd: int) -> None:
    flags = fcntl.fcntl(fd, fcntl.F_GETFL)
    fcntl.fcntl(fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)
