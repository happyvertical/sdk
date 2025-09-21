# Use Debian base image for Bun-only environment
FROM mcr.microsoft.com/devcontainers/base:bookworm

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=development
ENV FORCE_COLOR=1

# Install system dependencies for ONNX Runtime and OCR
RUN apt-get update && apt-get install -y \
    # C++ standard library and build tools
    libstdc++6 \
    libc6-dev \
    build-essential \
    gcc \
    g++ \
    cmake \
    # Additional dependencies for ONNX Runtime
    libgomp1 \
    libprotobuf-dev \
    # Git LFS for large files
    git-lfs \
    # GitHub CLI
    gh \
    # Docker CLI dependencies
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    # Cleanup
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Docker CLI for act to use
RUN install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && chmod a+r /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null \
    && apt-get update \
    && apt-get install -y docker-ce-cli \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install act (GitHub Actions local runner)
RUN curl -s https://raw.githubusercontent.com/nektos/act/master/install.sh | bash \
    && mv bin/act /usr/local/bin/act \
    && chmod +x /usr/local/bin/act

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash

# Add Bun to PATH for all users
ENV PATH="/root/.bun/bin:$PATH"
RUN echo 'export PATH="/root/.bun/bin:$PATH"' >> /etc/bash.bashrc

# Set working directory
WORKDIR /workspaces

# Create non-root user for development
RUN useradd -m -s /bin/bash devuser && \
    echo "devuser ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Add users to docker group for DinD support
RUN groupadd -f docker \
    && usermod -aG docker vscode \
    && usermod -aG docker devuser

# Install Bun for devuser as well
USER devuser
RUN curl -fsSL https://bun.sh/install | bash
RUN echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc

# Install Bun for vscode user (the default user)
USER vscode
RUN curl -fsSL https://bun.sh/install | bash
RUN echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc

# Add bun to global PATH for all users including git hooks
USER root
RUN echo 'PATH="/home/vscode/.bun/bin:/root/.bun/bin:$PATH"' >> /etc/environment

# Switch back to root for container initialization

# Copy package files for dependency installation
COPY package.json bun.lock* ./

# Install dependencies if package files exist (skip prepare scripts during build)
RUN if [ -f "package.json" ]; then \
    export PATH="/root/.bun/bin:$PATH" && \
    bun install --ignore-scripts; \
    fi

# Install Claude Code globally using Bun
USER root
RUN export PATH="/root/.bun/bin:$PATH" && bun add -g @anthropic-ai/claude-code

# Create certificates directory for DinD TLS
RUN mkdir -p /certs/client && chmod 755 /certs/client

# Create Claude directory for vscode user and set permissions
RUN mkdir -p /home/vscode/.claude && chown -R vscode:vscode /home/vscode/.claude

# Set the default user
USER vscode

# Default command
CMD ["sleep", "infinity"]