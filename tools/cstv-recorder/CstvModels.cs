using System.Text.Json.Serialization;

namespace MYTVHUD.CSTVRecorder;

internal sealed class CstvSyncData
{
    [JsonPropertyName("tick")]
    public long Tick { get; init; }

    [JsonPropertyName("rtdelay")]
    public double RoundTripDelay { get; init; }

    [JsonPropertyName("rcvage")]
    public double ReceiveAge { get; init; }

    [JsonPropertyName("fragment")]
    public int Fragment { get; init; }

    [JsonPropertyName("signup_fragment")]
    public int SignupFragment { get; init; }

    [JsonPropertyName("tps")]
    public int TicksPerSecond { get; init; }

    [JsonPropertyName("protocol")]
    public int Protocol { get; init; }
}

internal sealed class HttpAttemptSummary
{
    public required int Attempt { get; init; }
    public required DateTimeOffset RequestedAt { get; init; }
    public required int StatusCode { get; init; }
    public required int RedirectCount { get; init; }
    public required string FinalHost { get; init; }
    public string? ContentType { get; init; }
    public required int ContentLength { get; init; }
    public string? ErrorBody { get; init; }
}

internal sealed class EndpointCaptureSummary
{
    public required string Endpoint { get; init; }
    public required IReadOnlyList<HttpAttemptSummary> Attempts { get; init; }
    public bool Saved { get; init; }
    public string? FileName { get; init; }
}

internal sealed class CstvCaptureDiagnostics
{
    public const int SchemaVersion = 1;

    public required string RecordType { get; init; }
    public required int Schema { get; init; }
    public required string SessionId { get; init; }
    public required DateTimeOffset DetectedAt { get; init; }
    public required DateTimeOffset CompletedAt { get; init; }
    public required string SourceLogFileName { get; init; }
    public required string State { get; init; }
    public string? Error { get; init; }
    public IReadOnlyList<string> SyncFields { get; init; } = [];
    public bool HasTokenRedirectField { get; init; }
    public CstvSyncData? Sync { get; init; }
    public EndpointCaptureSummary? SyncCapture { get; init; }
    public EndpointCaptureSummary? StartCapture { get; init; }
    public EndpointCaptureSummary? FullCapture { get; init; }
    public IReadOnlyList<EndpointCaptureSummary> DeltaCaptures { get; init; } = [];
}
