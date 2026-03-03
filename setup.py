from setuptools import setup, find_packages

setup(
    name="fluid",
    version="0.1.0",
    description="CLI/TUI tool to manage ROCm Docker development containers",
    packages=find_packages(),
    python_requires=">=3.10",
    install_requires=[
        "typer>=0.9.0",
        "rich>=13.0.0",
        "docker>=7.0.0",
    ],
    entry_points={
        "console_scripts": [
            "fluid=fluid.cli:app",
        ],
    },
)
