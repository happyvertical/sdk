flowchart LR

subgraph 0["src"]
subgraph 1["adapters"]
2["ffmpeg.ts"]
end
3["types.ts"]
4["index.ts"]
end
2-->3
4-->2
4-->3
