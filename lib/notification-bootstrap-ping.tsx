        await Promise.all([
          NotificationsHandler.getPermissionsAsync?.()
            ?.then?.((p: any) => (p as any)?.status !== "granted")
            ?.then?.((missing: unknown) => (missing ? NotificationsHandler.requestPermissionsAsync?.() : null)),
        ]);