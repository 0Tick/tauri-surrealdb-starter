<script lang="ts">
  let {
    latestResult,
    streamResult,
    latestLivePayload,
    latestLiveNormalized,
    latestLivePatch,
  } = $props<{
    latestResult: string;
    streamResult: string;
    latestLivePayload: string;
    latestLiveNormalized: string;
    latestLivePatch: string;
  }>();
</script>

<h2>Payload Snapshots</h2>
<p class="meta">Latest query result</p>
<pre>{latestResult}</pre>
<p class="meta">Latest stream chunks</p>
<pre>{streamResult}</pre>
<p class="meta">Latest LIVE notification payload (full)</p>
<pre>{latestLivePayload}</pre>
<p class="meta">Latest LIVE notification payload (normalized)</p>
<pre>{latestLiveNormalized}</pre>
<p class="meta">Latest LIVE current/patch view</p>
<pre>{latestLivePatch}</pre>

<style>
  .meta {
    margin: 0.3rem 0;
    color: #2b3b59;
    font-size: 0.92rem;
  }

  pre {
    margin: 0.3rem 0 0.7rem;
    border-radius: 12px;
    padding: 0.7rem;
    font-size: 0.78rem;
    white-space: pre-wrap;
    word-break: break-word;
    background: #0f1626;
    color: #e4eeff;
    border: 1px solid rgba(228, 238, 255, 0.15);
  }

  @media (prefers-color-scheme: dark) {
    .meta {
      color: #bdcbea;
    }
  }
</style>
