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
B["factory.ts"]
end
A["index.ts"]
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
A-->2
A-->7
A-->8
A-->9
A-->4
A-->5
A-->B
A-->6
B-->2
B-->7
B-->8
B-->9
B-->6
