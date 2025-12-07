flowchart LR

subgraph 0["src"]
subgraph 1["cli"]
2["index.ts"]
3["parse-args.ts"]
end
subgraph 4["config"]
5["env-config.ts"]
end
6["index.ts"]
subgraph 7["shared"]
8["index.ts"]
subgraph 9["code"]
A["index.ts"]
B["extraction.ts"]
C["sandbox.ts"]
D["validation.ts"]
end
E["logger.ts"]
F["types.ts"]
G["universal.ts"]
end
H["web.ts"]
end
2-->3
6-->2
6-->5
6-->8
6-->H
8-->A
8-->E
8-->F
8-->G
A-->B
A-->C
A-->D
E-->F
G-->F
