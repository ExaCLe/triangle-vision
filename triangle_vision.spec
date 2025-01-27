# triangle_vision.spec

# -*- mode: python ; coding: utf-8 -*-

import sys
import os
from PyInstaller.utils.hooks import collect_all

block_cipher = None

# Collect all data and binaries from required packages
datas, binaries, hiddenimports = collect_all('uvicorn')

a = Analysis(
    ['app_launcher.py'],  # Entry point
    pathex=[os.getcwd()],
    binaries=binaries,
    datas=[
        ('frontend/build/**/*', 'frontend/build'),  # Include all frontend build files
        ('db/**/*', 'db'),  # Include the 'db' directory and its contents
        ('algorithm_to_find_combinations/**/*', 'algorithm_to_find_combinations'),  # Include necessary modules
    ],
    hiddenimports=[
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.protocols',
        'uvicorn.lifespan',
        # Add any other hidden imports if necessary
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='TriangleVision',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # Set to False if you don't want a console window
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
