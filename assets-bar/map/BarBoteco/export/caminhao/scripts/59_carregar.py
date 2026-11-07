# carrega o 59_caminhao no Blender MCP (cada chamada tem namespace novo): exec(open(r"...\59_carregar.py").read())
import bpy, time, traceback
from collections import Counter
SO_FUNCOES = True
_S = r"C:\Users\rafael\BarBoteco\scripts"
for _f in ("59_caminhao.py", "59a_cabine.py", "59b_bau.py", "59c_chassi.py", "59d_montagem.py", "59e_final.py"):
    if os.path.exists(_S + "\\" + _f) if "os" in globals() else __import__("os").path.exists(_S + "\\" + _f):
        exec(compile(open(_S + "\\" + _f, encoding="utf8").read(), _f, "exec"), globals())
