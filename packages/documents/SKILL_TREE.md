flowchart LR

subgraph 0["src"]
subgraph 1["cli"]
2["claude-context.ts"]
end
3["document.ts"]
4["types.ts"]
5["factory.ts"]
subgraph 6["processors"]
7["pdf.ts"]
end
8["utils.ts"]
9["index.ts"]
end
3-->4
5-->7
5-->4
7-->3
7-->4
7-->8
9-->3
9-->5
9-->7
9-->4
9-->8
