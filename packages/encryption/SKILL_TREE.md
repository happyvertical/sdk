flowchart LR

subgraph 0["src"]
subgraph 1["adapters"]
2["nacl.ts"]
7["node.ts"]
8["pgp.ts"]
end
subgraph 3["shared"]
4["base.ts"]
5["errors.ts"]
6["types.ts"]
C["factory.ts"]
end
subgraph 9["cli"]
A["claude-context.ts"]
end
B["index.ts"]
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
8-->6
B-->4
B-->5
B-->C
B-->6
C-->2
C-->7
C-->8
C-->6
