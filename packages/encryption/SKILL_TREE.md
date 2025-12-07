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
A["factory.ts"]
end
9["index.ts"]
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
9-->4
9-->5
9-->A
9-->6
A-->2
A-->7
A-->8
A-->6
