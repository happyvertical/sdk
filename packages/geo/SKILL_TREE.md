flowchart LR

subgraph 0["src"]
subgraph 1["cli"]
2["claude-context.ts"]
end
3["index.ts"]
subgraph 4["providers"]
5["google.ts"]
9["openstreetmap.ts"]
end
subgraph 6["shared"]
7["types.ts"]
8["utils.ts"]
end
A["static-maps.ts"]
end
3-->5
3-->9
3-->7
3-->7
3-->8
3-->A
5-->7
5-->7
5-->8
8-->7
9-->7
9-->7
9-->8
