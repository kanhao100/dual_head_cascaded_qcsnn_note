import subprocess, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
for s in ("run_stall_lif.py", "run_all_conv.py"):
    subprocess.run([sys.executable, os.path.join(HERE, s)], cwd=HERE, env=dict(os.environ, PYTHONIOENCODING="utf-8"))
print("ALL DONE")
