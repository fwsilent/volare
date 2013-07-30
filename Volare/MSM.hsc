module Volare.MSM (
    getSurfaceItems,
    getBarometricItems
) where

import Control.Exception (Exception,
                          throwIO)
import Data.Typeable (Typeable)
import Foreign.C (CFloat(..),
                  CInt(..),
                  CSize(..),
                  CString,
                  withCString)
import Foreign.Marshal (allocaArray,
                        peekArray)
import Foreign.Ptr (Ptr,
                    nullPtr)
import Foreign.Storable (Storable)

import qualified Volare.MSM.Barometric as Barometric
import qualified Volare.MSM.Surface as Surface

#include "../../../msm/msm.h"

data MSMException = MSMException deriving (Show, Typeable)

instance Exception MSMException


getSurfaceItems :: FilePath ->
                   (Float, Float) ->
                   (Float, Float) ->
                   Int ->
                   IO [Surface.Item]
getSurfaceItems = getItems get_surface_items


getBarometricItems :: FilePath ->
                      (Float, Float) ->
                      (Float, Float) ->
                      Int ->
                      IO [Barometric.Item]
getBarometricItems = getItems get_barometric_items


getItems :: Storable a =>
            (CString -> CFloat -> CFloat -> CFloat -> CFloat -> CInt -> Ptr a -> CSize -> IO CSize) ->
            FilePath ->
            (Float, Float) ->
            (Float, Float) ->
            Int ->
            IO [a]
getItems f path (nwLatitude, nwLongitude) (seLatitude, seLongitude) time =
  withCString path $ \cpath -> do
    let g = f cpath (CFloat nwLatitude) (CFloat nwLongitude) (CFloat seLatitude) (CFloat seLongitude) (fromIntegral time)
    count <- g nullPtr 0
    case count of
      -1 -> throwIO MSMException
      0 -> return []
      _ -> allocaArray (fromIntegral count) $ \values ->
             do readCount <- g values count
                case readCount of
                  -1 -> throwIO MSMException
                  0 -> return []
                  _ -> peekArray (fromIntegral readCount) values


foreign import ccall get_surface_items :: CString ->
                                          CFloat ->
                                          CFloat ->
                                          CFloat ->
                                          CFloat ->
                                          CInt ->
                                          Ptr Surface.Item ->
                                          CSize ->
                                          IO CSize

foreign import ccall get_barometric_items :: CString ->
                                             CFloat ->
                                             CFloat ->
                                             CFloat ->
                                             CFloat ->
                                             CInt ->
                                             Ptr Barometric.Item ->
                                             CSize ->
                                             IO CSize