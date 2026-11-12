import os
import pathlib
import runpy

# Preserve Library attributes as NTFS alternate data streams on Windows.
def setxattr(path, name, value, *args, **kwargs):
    pathlib.Path(str(path) + ':' + os.fsdecode(name)).write_bytes(value)

def getxattr(path, name, *args, **kwargs):
    return pathlib.Path(str(path) + ':' + os.fsdecode(name)).read_bytes()

if not hasattr(os, 'setxattr'):
    os.setxattr = setxattr
    os.getxattr = getxattr
runpy.run_path(str(pathlib.Path(__file__).with_name('library_file_transfer.py')), run_name='__main__')
