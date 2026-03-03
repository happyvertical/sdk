flowchart LR

subgraph 0["src"]
subgraph 1["adapters"]
2["gmail.ts"]
7["imap.ts"]
8["pop3.ts"]
9["smtp.ts"]
end
subgraph 3["shared"]
4["base.ts"]
5["errors.ts"]
6["types.ts"]
D["factory.ts"]
end
subgraph A["cli"]
B["claude-context.ts"]
end
C["index.ts"]
end
2-->4
2-->5
2-->6
4-->5
4-->6
7-->4
7-->5
7-->6
8-->4
8-->5
8-->6
9-->4
9-->5
9-->6
C-->2
C-->7
C-->8
C-->9
C-->4
C-->5
C-->D
C-->6
D-->2
D-->7
D-->8
D-->9
D-->6
