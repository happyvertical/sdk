flowchart LR

subgraph 0["src"]
subgraph 1["cli"]
2["claude-context.ts"]
end
3["index.ts"]
subgraph 4["providers"]
5["deepl.ts"]
9["google.ts"]
A["libretranslate.ts"]
end
subgraph 6["shared"]
7["types.ts"]
8["utils.ts"]
end
end
3-->5
3-->9
3-->A
3-->7
3-->7
3-->8
5-->7
5-->7
5-->8
9-->7
9-->7
9-->8
A-->7
A-->7
A-->8
