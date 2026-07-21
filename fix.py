import sys
import os

with open("header.txt", "r", encoding="utf-8") as f:
    header = f.read()

with open("index.html", "r", encoding="utf-8") as f:
    lines = f.readlines()

# line 22 is index 21
rest = "".join(lines[21:])

with open("index.html", "w", encoding="utf-8") as f:
    f.write(header + "\n" + rest)

print("Done")
