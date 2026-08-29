#import "AppIconManager.h"

#import <UIKit/UIKit.h>

static NSString *debugRejectionScenario = nil;
static NSString * const debugHarnessInfoPlistKey = @"EduAIIconDebugHarnessEnabled";

static BOOL debugHarnessEnabled(void) {
#if DEBUG
  id value = [[NSBundle mainBundle] objectForInfoDictionaryKey:debugHarnessInfoPlistKey];
  return [value respondsToSelector:@selector(boolValue)] && [value boolValue];
#else
  return NO;
#endif
}

static BOOL consumeDebugRejectionForScenario(NSString *scenario) {
#if DEBUG
  @synchronized ([AppIconManager class]) {
    if (!debugHarnessEnabled() || ![debugRejectionScenario isEqualToString:scenario]) {
      return NO;
    }
    debugRejectionScenario = nil;
    return YES;
  }
#else
  return NO;
#endif
}

@implementation AppIconManager

RCT_EXPORT_MODULE(AppIconManager);

RCT_EXPORT_METHOD(setIcon:(NSString *)iconId
                  debugScenario:(NSString *)debugScenario
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSString *alternateIconName = nil;
  if ([iconId isEqualToString:@"standard"]) {
    // nil is the explicit iOS reset to the primary AppIcon asset.
    alternateIconName = nil;
  } else if ([iconId isEqualToString:@"app_icon_midnight"]) {
    alternateIconName = @"midnight";
  } else if ([iconId isEqualToString:@"app_icon_neon"]) {
    alternateIconName = @"neon";
  } else if ([iconId isEqualToString:@"app_icon_scholar"]) {
    alternateIconName = @"scholar";
  } else if ([iconId isEqualToString:@"app_icon_aurora"]) {
    alternateIconName = @"aurora";
  } else if ([iconId isEqualToString:@"app_icon_legend"]) {
    alternateIconName = @"legend";
  } else {
    reject(@"E_INVALID_ICON", [NSString stringWithFormat:@"Unsupported launcher icon: %@", iconId], nil);
    return;
  }

  dispatch_async(dispatch_get_main_queue(), ^{
    UIApplication *application = UIApplication.sharedApplication;
    if (!application.supportsAlternateIcons) {
      reject(@"E_ALTERNATE_ICONS_UNAVAILABLE", @"Alternate app icons are not available.", nil);
      return;
    }

    if (debugScenario != nil && consumeDebugRejectionForScenario(debugScenario)) {
      reject(@"E_DEBUG_ICON_REJECTION",
             [NSString stringWithFormat:@"Debug bridge rejection for scenario: %@", debugScenario],
             nil);
      return;
    }

    [application setAlternateIconName:alternateIconName
                    completionHandler:^(NSError * _Nullable error) {
      if (error) {
        reject(@"E_ICON_UPDATE", error.localizedDescription, error);
      } else {
        resolve(nil);
      }
    }];
  });
}

RCT_EXPORT_METHOD(configureDebugRejection:(NSString *)scenario
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
#if DEBUG
  if (!debugHarnessEnabled()) {
    reject(@"E_DEBUG_HARNESS_UNAVAILABLE",
           @"The icon rejection harness is disabled for this build.",
           nil);
    return;
  }

  NSSet<NSString *> *scenarios = [NSSet setWithObjects:@"acquisto", @"equipaggiamento", @"ripristino", nil];
  if (![scenarios containsObject:scenario]) {
    reject(@"E_INVALID_DEBUG_SCENARIO",
           [NSString stringWithFormat:@"Unsupported icon rejection scenario: %@", scenario],
           nil);
    return;
  }

  @synchronized ([AppIconManager class]) {
    debugRejectionScenario = [scenario copy];
  }
  resolve(nil);
#else
  reject(@"E_DEBUG_HARNESS_UNAVAILABLE",
         @"The icon rejection harness is available only in debug builds.",
         nil);
#endif
}

@end