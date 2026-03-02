flowchart LR

subgraph 0["src"]
subgraph 1["cli"]
2["claude-context.ts"]
end
3["factory.ts"]
subgraph 4["node"]
5["local.ts"]
end
subgraph 6["shared"]
7["base.ts"]
8["types.ts"]
G["factory.ts"]
end
9["fetch.ts"]
A["filesystem-local.ts"]
B["filesystem.ts"]
C["index.ts"]
D["legacy.ts"]
subgraph E["providers"]
F["gdrive.ts"]
end
end
3-->5
3-->8
5-->7
5-->8
7-->8
A-->B
A-->C
B-->C
C-->9
C-->B
C-->D
C-->5
C-->F
C-->G
C-->G
C-->8
F-->7
F-->8
G-->5
G-->F
G-->8
