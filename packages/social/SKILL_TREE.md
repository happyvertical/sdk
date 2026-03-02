flowchart LR

subgraph 0["src"]
subgraph 1["adapters"]
2["bluesky.ts"]
4["threads.ts"]
5["x.ts"]
6["youtube.ts"]
end
3["types.ts"]
7["index.ts"]
end
2-->3
2-->3
4-->3
4-->3
5-->3
5-->3
6-->3
6-->3
7-->2
7-->4
7-->5
7-->6
7-->3
7-->3
