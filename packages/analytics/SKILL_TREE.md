flowchart LR

subgraph 0["src"]
subgraph 1["cli"]
2["claude-context.ts"]
end
3["index.ts"]
subgraph 4["shared"]
5["factory.ts"]
subgraph 6["providers"]
7["ga4.ts"]
9["plausible.ts"]
end
8["types.ts"]
end
end
3-->5
3-->8
3-->8
5-->7
5-->9
5-->8
7-->8
7-->8
9-->8
9-->8
