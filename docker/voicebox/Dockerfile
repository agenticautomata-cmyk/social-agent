# Benson Studio Voice — pinned Voicebox backend (v0.5.0)
FROM python:3.12-slim-bookworm

ARG VOICEBOX_TAG=v0.5.0
ARG VOICEBOX_COMMIT=888043298d91b55b82b5deccb36078260afcb355

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    VOICEBOX_DATA_DIR=/var/lib/voicebox \
    HF_HOME=/var/lib/voicebox/huggingface \
    TORCH_HOME=/var/lib/voicebox/torch \
    VOICEBOX_UPSTREAM_TAG=${VOICEBOX_TAG} \
    VOICEBOX_UPSTREAM_COMMIT=${VOICEBOX_COMMIT}

RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl ca-certificates ffmpeg build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/voicebox

RUN git clone --depth 1 --branch "${VOICEBOX_TAG}" https://github.com/jamiepine/voicebox.git . \
    && git rev-parse HEAD > /opt/voicebox/VERSION \
    && test "$(cat /opt/voicebox/VERSION)" = "${VOICEBOX_COMMIT}" || echo "WARN: commit drift from pin"

WORKDIR /opt/voicebox/backend

RUN pip install --upgrade pip setuptools wheel \
    && pip install -r requirements.txt

WORKDIR /opt/voicebox

RUN useradd -m -u 10001 voicebox \
    && mkdir -p /var/lib/voicebox /tmp/voicebox-work \
    && chown -R voicebox:voicebox /var/lib/voicebox /tmp/voicebox-work /opt/voicebox

COPY entrypoint.sh /usr/local/bin/voicebox-entrypoint.sh
RUN chmod +x /usr/local/bin/voicebox-entrypoint.sh

EXPOSE 17493

HEALTHCHECK --interval=30s --timeout=15s --start-period=180s --retries=5 \
  CMD curl -sf http://127.0.0.1:17493/health || exit 1

ENTRYPOINT ["/usr/local/bin/voicebox-entrypoint.sh"]
