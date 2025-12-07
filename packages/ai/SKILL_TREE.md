flowchart LR

subgraph 0["src"]
1["index.ts"]
subgraph 2["shared"]
3["client.ts"]
4["factory.ts"]
subgraph 5["providers"]
6["anthropic.ts"]
8["bedrock.ts"]
9["claude-cli.ts"]
A["gemini.ts"]
B["huggingface.ts"]
C["openai.ts"]
end
7["types.ts"]
D["message.ts"]
E["thread.ts"]
end
subgraph F["node"]
G["factory.ts"]
end
end
1-->3
1-->4
1-->D
1-->E
1-->7
3-->4
3-->D
4-->3
4-->6
4-->8
4-->9
4-->A
4-->B
4-->C
4-->7
6-->7
6-->7
8-->7
8-->7
9-->7
9-->7
9-->6
A-->7
A-->7
B-->7
B-->7
C-->7
C-->7
D-->E
E-->3
E-->D
G-->4
G-->4
G-->7
