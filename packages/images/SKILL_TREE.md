flowchart LR

subgraph 0["src"]
subgraph 1["adapters"]
2["imgproxy.ts"]
6["jimp.ts"]
7["sharp.ts"]
end
subgraph 3["shared"]
4["errors.ts"]
5["types.ts"]
C["factory.ts"]
end
subgraph 8["cli"]
9["claude-context.ts"]
end
A["headline-card.ts"]
B["index.ts"]
end
2-->4
2-->5
6-->4
6-->5
7-->4
7-->5
B-->2
B-->6
B-->7
B-->A
B-->4
B-->C
B-->5
B-->5
C-->2
C-->6
C-->7
C-->4
C-->5
